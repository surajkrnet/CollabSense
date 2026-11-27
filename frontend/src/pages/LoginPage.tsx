import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
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
      /* network probe blocked by browser: proceed to OAuth redirect */
    }
    window.location.assign(data.url);
  };

  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen two26-blush-surface text-ink flex flex-col justify-between px-4 py-6 sm:px-8 relative overflow-hidden">
      {/* Decorative Edge-Bleeding #FF5400 Vector Loop */}
      <svg
        className="pointer-events-none absolute -right-24 -top-12 w-80 h-80 opacity-90"
        viewBox="0 0 320 320"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M340 30 C 160 40, 110 170, 210 230 C 280 270, 310 170, 210 150 C 110 130, 110 260, 330 300"
          stroke="#FF5400"
          strokeWidth="26"
          strokeLinecap="round"
        />
      </svg>

      {/* Top Bar */}
      <header className="max-w-[1400px] w-full mx-auto flex items-center justify-between gap-4 relative z-10">
        <Link to="/" className="two26-nav-pill">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Studio</span>
        </Link>

        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full hover:opacity-85 transition-opacity"
          aria-label="CollabSense home"
        >
          <PostHogBrandMark size="md" textLabel="COLLABSENSE" />
        </Link>

        <div className="hidden sm:block text-right text-[11px] font-bold text-[#111111]">
          <div>Supabase RLS</div>
          <div className="text-[#6E6059]">Google OAuth Ready</div>
        </div>
      </header>

      {/* Center Auth Card */}
      <div className="my-8 flex flex-col items-center justify-center relative z-10">
        <div className="text-center mb-6 relative">
          <span
            className="two26-sticker-pill text-xs mb-3 inline-flex"
            style={{ transform: 'rotate(-3deg)' }}
          >
            {isSignup ? 'Free Early Access · All 8 Stages' : 'Welcome back to the Studio'}
          </span>
          <h1 className="two26-display text-5xl sm:text-6xl text-[#FF5400]">
            {isSignup ? 'CREATE YOUR ACCOUNT' : 'ENTER THE WORKSPACE'}
          </h1>
        </div>

        <main className="w-full max-w-md bg-[#FFFFFF] border-2 border-[#111111] rounded-[28px] p-6 sm:p-8 cs-panel-enter">
          <div
            className="grid grid-cols-2 bg-[#F8EEE8] p-1 rounded-full border border-[#DFCFC6] mb-6"
            role="tablist"
            aria-label="Authentication mode"
          >
            <Link
              to={`/login${nextQuery}`}
              role="tab"
              aria-selected={!isSignup}
              className={`py-2 text-center text-xs font-extrabold uppercase tracking-wider rounded-full transition-colors ${
                !isSignup ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#3D3531] hover:text-[#111111]'
              }`}
            >
              Log in
            </Link>
            <Link
              to={`/signup${nextQuery}`}
              role="tab"
              aria-selected={isSignup}
              className={`py-2 text-center text-xs font-extrabold uppercase tracking-wider rounded-full transition-colors ${
                isSignup ? 'bg-[#FF5400] text-[#FFFFFF]' : 'text-[#3D3531] hover:text-[#111111]'
              }`}
            >
              Create account
            </Link>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            data-testid="google-oauth-btn"
            className="w-full cs-btn-secondary py-2.5 font-bold border-[#111111]/20"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGlyph />}
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-rule" />
            <span>or with work email</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="auth-fullname" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                  Name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  autoComplete="name"
                  placeholder="Suraj K R"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'err-name' : undefined}
                  className="cs-input"
                />
                {fieldErrors.name && (
                  <p id="err-name" className="mt-1 text-xs font-semibold text-error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="pm@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => email && setFieldErrors((f) => ({ ...f, email: validateEmail(email) || undefined }))}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'err-email' : undefined}
                className="cs-input"
              />
              {fieldErrors.email && (
                <p id="err-email" className="mt-1 text-xs font-semibold text-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
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
                <p id="err-password" className="mt-1 text-xs font-semibold text-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {formError && (
              <div role="alert" className="cs-banner-red text-xs font-semibold">
                {formError}
              </div>
            )}
            {notice && (
              <div role="status" className="cs-banner-green text-xs font-semibold">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading || !isSupabaseConfigured}
              data-testid="email-auth-submit"
              className="w-full two26-cta-pill justify-center py-2.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isSignup ? 'Create account' : 'Sign in to Workspace'}</span>
              <span className="two26-arrow-circle" aria-hidden="true">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>
          </form>

          <p className="mt-6 text-center text-xs font-medium text-ink-2">
            {isSignup ? 'Already have an account? ' : 'New to CollabSense? '}
            <Link
              to={`${isSignup ? '/login' : '/signup'}${nextQuery}`}
              className="font-extrabold text-[#FF5400] underline underline-offset-4 hover:text-[#111111]"
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </main>
      </div>

      {/* Footer Note */}
      <footer className="max-w-[1400px] w-full mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#6E6059] relative z-10">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#15803D]" />
          Protected by Supabase Row-Level Security
        </span>
        <span>CollabSense Studio · v4.1.0</span>
      </footer>
    </div>
  );
};
