import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { PostHogBrandMark } from '../components/PostHogDesktopShell';
import {
  isSupabaseConfigured,
  safeNextPath,
  supabase,
  validateEmail,
  validatePassword,
} from '../lib/supabase';

type Mode = 'signin' | 'signup';

const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 18 18" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      fill="var(--color-info)"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
    />
    <path
      fill="var(--color-success)"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
    />
    <path
      fill="var(--color-accent)"
      d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
    />
    <path
      fill="var(--color-error)"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
    />
  </svg>
);

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mode: Mode = location.pathname === '/signup' ? 'signup' : 'signin';
  const params = new URLSearchParams(location.search);
  const nextPath = safeNextPath(params.get('next'));
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(nextPath)}` : '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Already signed in (or just returned from Google / an email confirmation link): continue.
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session?.user) navigate(nextPath, { replace: true });
    });
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) navigate(nextPath, { replace: true });
    });
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');
    if (hashError) setFormError(hashError.replace(/\+/g, ' '));
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, [navigate, nextPath]);

  // Reset messages when switching between sign in and sign up.
  useEffect(() => {
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    const errs: typeof fieldErrors = {};
    if (mode === 'signup' && fullName.trim().length < 2) errs.name = 'Enter your name.';
    const emailErr = validateEmail(email);
    if (emailErr) errs.email = emailErr;
    const pwErr = validatePassword(password, mode);
    if (pwErr) errs.password = pwErr;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    if (!supabase) {
      setFormError('Sign in is unavailable: Supabase is not configured for this build.');
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/login${nextQuery}`,
          },
        });
        if (error) {
          setFormError(error.message);
        } else if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setFormError('An account with this email already exists. Sign in instead.');
        } else if (!data.session) {
          setNotice(`We sent a confirmation link to ${cleanEmail}. Open it to activate your account, then sign in.`);
          setPassword('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          setFormError(
            /confirm/i.test(error.message)
              ? 'Confirm your email first: open the link we sent to your inbox.'
              : /invalid/i.test(error.message)
              ? 'Incorrect email or password.'
              : error.message
          );
        }
      }
    } catch {
      setFormError('Could not reach the authentication server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    setNotice(null);
    if (!supabase) {
      setFormError('Google sign in is unavailable: Supabase is not configured for this build.');
      return;
    }
    setGoogleLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login${nextQuery}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setGoogleLoading(false);
      setFormError(error?.message || 'Google sign in could not start.');
      return;
    }
    // Ask the auth server first, so a disabled provider shows a message instead of a raw JSON page.
    try {
      const probe = await fetch(data.url, { method: 'GET', redirect: 'manual' });
      if (probe.type !== 'opaqueredirect' && probe.status >= 400) {
        const body = await probe.json().catch(() => ({}));
        const msg = String(body?.msg || body?.error_description || body?.message || '');
        setGoogleLoading(false);
        setFormError(
          /not enabled|unsupported provider/i.test(msg)
            ? 'Google sign in is not enabled for this workspace yet. Use email for now.'
            : msg || 'Google sign in could not start.'
        );
        return;
      }
    } catch {
      /* network probe blocked by the browser: fall through to the redirect */
    }
    window.location.assign(data.url);
  };

  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen desk-surface text-ink flex flex-col items-center justify-center px-4 py-10">
      <Link
        to="/"
        className="mb-8 inline-flex items-center justify-center rounded-input hover:opacity-85 transition-opacity"
        aria-label="CollabSense home"
      >
        <PostHogBrandMark size="lg" textLabel="CollabSense" />
      </Link>

      <main className="w-full max-w-sm stock-card p-6 sm:p-7 cs-panel-enter">
        <div className="grid grid-cols-2 border-b border-rule mb-5" role="tablist" aria-label="Authentication mode">
          <Link
            to={`/login${nextQuery}`}
            role="tab"
            aria-selected={!isSignup}
            className={`py-2.5 text-center text-sm font-semibold border-b-2 transition-colors ${
              !isSignup ? 'border-paid text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            Log in
          </Link>
          <Link
            to={`/signup${nextQuery}`}
            role="tab"
            aria-selected={isSignup}
            className={`py-2.5 text-center text-sm font-semibold border-b-2 transition-colors ${
              isSignup ? 'border-paid text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            Create account
          </Link>
        </div>

        <h1 className="auth-title text-xl font-bold text-ink text-center">
          {isSignup ? 'Create your account' : 'Log in'}
        </h1>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          data-testid="google-oauth-btn"
          className="mt-6 w-full cs-btn-secondary"
        >
          {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGlyph />}
          <span>Continue with Google</span>
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-rule" />
          <span>or</span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {isSignup && (
            <div>
              <label htmlFor="auth-fullname" className="block text-sm font-semibold text-ink mb-1.5">
                Name
              </label>
              <input
                id="auth-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'err-name' : undefined}
                className="cs-input"
              />
              {fieldErrors.name && (
                <p id="err-name" className="mt-1 text-xs text-error">
                  {fieldErrors.name}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-semibold text-ink mb-1.5">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email && setFieldErrors((f) => ({ ...f, email: validateEmail(email) || undefined }))}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'err-email' : undefined}
              className="cs-input"
            />
            {fieldErrors.email && (
              <p id="err-email" className="mt-1 text-xs text-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-semibold text-ink mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'err-password' : undefined}
                className="cs-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-muted hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="err-password" className="mt-1 text-xs text-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {formError && (
            <div role="alert" className="cs-banner-red text-sm">
              {formError}
            </div>
          )}
          {notice && (
            <div role="status" className="cs-banner-green text-sm">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading || !isSupabaseConfigured}
            data-testid="email-auth-submit"
            className="w-full cs-btn-primary"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isSignup ? 'Create account' : 'Sign in'}</span>
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-2">
          {isSignup ? 'Already have an account? ' : 'New to CollabSense? '}
          <Link
            to={`${isSignup ? '/login' : '/signup'}${nextQuery}`}
            className="font-semibold text-ink underline underline-offset-4 hover:text-paid"
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </main>
    </div>
  );
};
