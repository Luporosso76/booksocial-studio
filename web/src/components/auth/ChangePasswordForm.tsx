import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { ErrorBanner } from "@/components/ui/misc";
import { authChangePassword } from "@/api/endpoints";
import { errorMessage } from "@/lib/useAsync";

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError(t("auth.errTooShort"));
      return;
    }
    if (next !== confirm) {
      setError(t("auth.errMismatch"));
      return;
    }
    setBusy(true);
    try {
      await authChangePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    } catch (err) {
      setError(errorMessage(err) || t("auth.errChangeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && <ErrorBanner message={error} />}
      <Field label={t("auth.currentPassword")}>
        <Input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label={t("auth.newPassword")}>
        <Input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
          placeholder={t("auth.newPasswordHint")}
        />
      </Field>
      <Field label={t("auth.confirmPassword")}>
        <Input
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={busy || !current || !next || !confirm}>
          <Check className="h-4 w-4" />
          {busy ? t("auth.saving") : t("auth.changePassword")}
        </Button>
        {done && <span className="text-sm text-green-500">{t("auth.changed")}</span>}
      </div>
    </form>
  );
}
