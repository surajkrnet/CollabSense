import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  CollabSenseUser,
  getAuthenticatedUser,
  mapSupabaseUser,
  supabase,
} from '../lib/supabase';

interface AuthGuardProps {
  children: (user: CollabSenseUser) => React.ReactNode;
}

/** Every /projects and /app route passes through here: no session, no access. */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const location = useLocation();
  const [user, setUser] = useState<CollabSenseUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAuthenticatedUser().then((u) => {
      if (!mounted) return;
      setUser(u);
      setChecking(false);
    });

    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
    });

    return () => {
      mounted = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="text-sm font-medium text-ink-2">Checking your session…</div>
      </div>
    );
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children(user)}</>;
};
