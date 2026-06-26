import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { ErrorBanner } from "@/components/ui/misc";
import { authStatus, authLogin } from "@/api/endpoints";
import { setUnauthorizedHandler } from "@/api/client";
import { errorMessage } from "@/lib/useAsync";
import { ChangePasswordForm } from "./ChangePasswordForm";

type Phase = "loading" | "login" | "mustChange" | "ok";

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-raised p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-accent-glow">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-content-primary">{t("nav.brand")}</div>
            <div className="text-2xs font-medium uppercase tracking-wide text-content-faint">
              {t("nav.brandSub")}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await authStatus();
      setPhase(s.authenticated ? (s.mustChange ? "mustChange" : "ok") : "login");
    } catch {
      setPhase("login");
    }
  }, []);

  useEffect(() => {
    void refresh();
    setUnauthorizedHandler(() => setPhase("login"));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await authLogin(username.trim(), password);
      setPassword("");
      setPhase(res.mustChange ? "mustChange" : "ok");
    } catch (err) {
      setError(errorMessage(err) || t("auth.errLoginFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-bg-base" />;
  }

  if (phase === "login") {
    return (
      <Shell>
        <form onSubmit={submitLogin} className="flex flex-col gap-3">
          <h1 className="text-base font-semibold text-content-primary">{t("auth.loginTitle")}</h1>
          {error && <ErrorBanner message={error} />}
          <Field label={t("auth.username")}>
            <Input
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t("auth.password")}>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy || !username || !password} className="mt-1">
            <LogIn className="h-4 w-4" />
            {busy ? t("auth.loggingIn") : t("auth.login")}
          </Button>
        </form>
      </Shell>
    );
  }

  if (phase === "mustChange") {
    return (
      <Shell>
        <div className="flex flex-col gap-3">
          <h1 className="text-base font-semibold text-content-primary">
            {t("auth.mustChangeTitle")}
          </h1>
          <p className="text-sm text-content-secondary">{t("auth.mustChangeHint")}</p>
          <ChangePasswordForm onDone={() => void refresh()} />
        </div>
      </Shell>
    );
  }

  return <>{children}</>;
}
