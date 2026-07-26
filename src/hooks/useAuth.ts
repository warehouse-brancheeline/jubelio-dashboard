import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authErrorMessage, authParamsFromUrl, cleanAuthUrl } from "../lib/dashboard";
import { configurationError, supabase } from "../supabase";

type AuthMode = "login" | "recovery";

export type AuthController = {
  loading: boolean;
  busy: boolean;
  user: User | null;
  session: Session | null;
  mode: AuthMode;
  message: string | null;
  messageKind: "error" | "success";
  signIn: (email: string, password: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  sendRecovery: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearMessage: () => void;
};

function redirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function useAuth(): AuthController {
  const [loading, setLoading] = useState(Boolean(supabase));
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [message, setMessage] = useState<string | null>(configurationError);
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");

  const showError = useCallback((error: unknown) => {
    const description = error instanceof Error ? error.message : String(error);
    setMessageKind("error");
    setMessage(authErrorMessage(null, description));
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;
    const url = new URL(window.location.href);
    const params = authParamsFromUrl(url);

    async function initialize() {
      try {
        if (params.error || params.errorCode || params.errorDescription) {
          setMessageKind("error");
          setMessage(authErrorMessage(params.errorCode ?? params.error, params.errorDescription));
        }

        if (params.accessToken && params.refreshToken) {
          const { data, error } = await supabase!.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          });
          if (error) throw error;
          if (active) setSession(data.session);
        } else {
          const { data, error } = await supabase!.auth.getSession();
          if (error) throw error;
          if (active) setSession(data.session);
        }

        if (params.type === "recovery") setMode("recovery");
      } catch (error) {
        if (active) showError(error);
      } finally {
        const hasAuthParams =
          params.accessToken ||
          params.refreshToken ||
          params.error ||
          params.errorCode ||
          params.errorDescription ||
          params.type;
        if (hasAuthParams) {
          window.history.replaceState({}, document.title, cleanAuthUrl(url));
        }
        if (active) setLoading(false);
      }
    }

    void initialize();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
      if (event === "SIGNED_OUT") setMode("login");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [showError]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setMessage(null);
      try {
        await action();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  const signIn = useCallback(
    async (email: string, password: string) =>
      run(async () => {
        if (!supabase) throw new Error(configurationError ?? "Supabase belum siap.");
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }),
    [run],
  );

  const sendMagicLink = useCallback(
    async (email: string) =>
      run(async () => {
        if (!supabase) throw new Error(configurationError ?? "Supabase belum siap.");
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectUrl(),
          },
        });
        if (error) throw error;
        setMessageKind("success");
        setMessage("Tautan masuk baru sudah dikirim. Buka email terbaru dari perangkat ini.");
      }),
    [run],
  );

  const sendRecovery = useCallback(
    async (email: string) =>
      run(async () => {
        if (!supabase) throw new Error(configurationError ?? "Supabase belum siap.");
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirectUrl(),
        });
        if (error) throw error;
        setMessageKind("success");
        setMessage("Tautan pengaturan password sudah dikirim ke email Anda.");
      }),
    [run],
  );

  const updatePassword = useCallback(
    async (password: string) =>
      run(async () => {
        if (!supabase) throw new Error(configurationError ?? "Supabase belum siap.");
        if (password.length < 8) throw new Error("Password minimal 8 karakter.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMode("login");
        setMessageKind("success");
        setMessage("Password berhasil diperbarui.");
      }),
    [run],
  );

  const signOut = useCallback(
    async () =>
      run(async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }),
    [run],
  );

  return useMemo(
    () => ({
      loading,
      busy,
      user: session?.user ?? null,
      session,
      mode,
      message,
      messageKind,
      signIn,
      sendMagicLink,
      sendRecovery,
      updatePassword,
      signOut,
      clearMessage: () => setMessage(null),
    }),
    [
      loading,
      busy,
      session,
      mode,
      message,
      messageKind,
      signIn,
      sendMagicLink,
      sendRecovery,
      updatePassword,
      signOut,
    ],
  );
}
