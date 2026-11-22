import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const runtimeEnv =
  typeof window !== 'undefined'
    ? ((window as unknown as { __COLLABSENSE_ENV__?: Record<string, string> }).__COLLABSENSE_ENV__ || {})
    : {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.startsWith('your_');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface CollabSenseUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  authMode: 'SUPABASE';
}

/** Legacy key from the removed demo bypass; cleared so no one keeps a fake session. */
const LEGACY_DEMO_SESSION_KEY = 'collabsense_demo_pm_session_v3';

export function mapSupabaseUser(u: User): CollabSenseUser {
  const meta = (u.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    u.email?.split('@')[0] ||
    'Product Manager';
  return {
    id: u.id,
    email: u.email || '',
    fullName,
    role: 'Product Manager',
    authMode: 'SUPABASE',
  };
}

/** Returns the authenticated Supabase user, or null. Never fabricates a session. */
export async function getAuthenticatedUser(): Promise<CollabSenseUser | null> {
  try {
    localStorage.removeItem(LEGACY_DEMO_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ? mapSupabaseUser(data.session.user) : null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export async function clearSessionUser(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_DEMO_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  if (supabase) await supabase.auth.signOut();
}

/* ---------- Email validation (client side; Supabase confirmation email is the final proof) ---------- */

const DISPOSABLE_OR_PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.test',
  'localhost',
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'fakeinbox.com',
  'maildrop.cc',
  'throwawaymail.com',
]);

const EMAIL_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

/** Returns an error message, or null when the address is acceptable. */
export function validateEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return 'Enter your email address.';
  if (email.length > 254) return 'That email address is too long.';
  if (!EMAIL_PATTERN.test(email) || email.includes('..')) {
    return 'Enter a valid email address, like name@company.com.';
  }
  const domain = email.split('@')[1];
  if (DISPOSABLE_OR_PLACEHOLDER_DOMAINS.has(domain)) {
    return 'Use your real work or personal email. Disposable and placeholder domains are not accepted.';
  }
  return null;
}

export function validatePassword(pw: string, mode: 'signin' | 'signup'): string | null {
  if (!pw) return 'Enter your password.';
  if (mode === 'signup') {
    if (pw.length < 8) return 'Use at least 8 characters.';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  }
  return null;
}

/** Only allow in-app relative redirect targets. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/projects';
  if (next.startsWith('/login') || next.startsWith('/signup')) return '/projects';
  return next;
}
