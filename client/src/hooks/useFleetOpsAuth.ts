import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useFleetOpsAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
        setSession(null);
        setUser(null);
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
      } else {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    // signInWithPassword replaces an invalid persisted session itself. Clearing
    // local storage just before the grant can race the auth-state callback and
    // remove the newly-issued session, returning a valid user to the login form.
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!result.error && result.data.session) {
      setSession(result.data.session);
      setUser(result.data.session.user);
      setLoading(false);
    }
    return result;
  };

  const signOut = () => supabase.auth.signOut({ scope: "local" });
  const requestPasswordReset = (email: string, redirectTo: string) => supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  const updatePassword = (password: string) => supabase.auth.updateUser({ password });

  return {
    session,
    user,
    loading,
    isAuthenticated: Boolean(session),
    signInWithEmail,
    signUpWithEmail: (email: string, password: string, fullName: string, invitationToken?: string) => supabase.auth.signUp({ email: email.trim(), password, options: { data: { fullName, needsOnboarding: invitationToken ? false : true, invitationToken } } }),
    signOut,
    requestPasswordReset,
    updatePassword,
    refreshSession: async () => {
      const result = await supabase.auth.refreshSession();
      if (result.error || !result.data.session) {
        await supabase.auth.signOut({ scope: "local" });
      }
      return result;
    },
  };
}
