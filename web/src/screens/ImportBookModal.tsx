import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UploadCloud, FileText, Check, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { ErrorBanner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { importBook, getAnalysisStatus } from "@/api/endpoints";
import { errorMessage } from "@/lib/useAsync";
import type { Book } from "@/api/types";
import { cn } from "@/lib/cn";

const STEPS = [
  { key: "read", labelKey: "import.stepRead" },
  { key: "analyze", labelKey: "import.stepAnalyze" },
  { key: "save", labelKey: "import.stepSave" },
] as const;

export function ImportBookModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (book: Book) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<number | null>(null);

  function stopPoll() {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function reset() {
    setFile(null);
    setAuthor("");
    setLanguage("");
    setStep(0);
    setBusy(false);
    setError(null);
    stopPoll();
  }

  useEffect(() => {
    return () => stopPoll();
  }, []);

  function pickFile(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".md")) {
      setError(t("import.errorMarkdownOnly"));
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleImport() {
    if (!file) {
      toast.error(t("import.errorSelectFile"));
      return;
    }
    setBusy(true);
    setStep(0);
    setError(null);
    try {
      // Import VELOCE: il libro viene creato subito; l'analisi gira in background.
      const book = await importBook(file, {
        author: author.trim() || undefined,
        language: language.trim() || undefined,
      });
      onImported(book); // compare subito nella libreria
      setStep(1); // analisi in corso
      // Polling dello stato: la connessione non resta appesa anche su libri grandi.
      const tick = async () => {
        try {
          const st = await getAnalysisStatus(book.id);
          if (st.status === "ready") {
            stopPoll();
            setStep(2);
            toast.success(t("import.cardReady", { title: book.title }));
            onImported(book);
            reset();
            onClose();
          } else if (st.status === "failed") {
            // Errore PERSISTENTE in-place nel modale (non un toast che sparisce).
            stopPoll();
            setBusy(false);
            setStep(0);
            setError(t("import.analysisFailed", { error: st.error || "errore sconosciuto" }));
          }
          // analyzing | idle: continua a interrogare
        } catch {
          // errore di rete transitorio: ritenta al prossimo giro
        }
      };
      void tick();
      pollTimer.current = window.setInterval(() => void tick(), 3000);
    } catch (err) {
      setBusy(false);
      setStep(0);
      setError(errorMessage(err) || t("import.errorImportFailed"));
    }
  }

  // Chiudibile anche durante l'analisi: continua in background, la scheda comparira' da sola.
  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("import.title")}
      description={t("import.description")}
      footer={
        !busy ? (
          <>
            <Button variant="ghost" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={!file}>
              {t("import.importAndAnalyze")}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleClose}>
            {t("import.closeBackground")}
          </Button>
        )
      }
    >
      {error && (
        <div className="mb-4" role="alert">
          <ErrorBanner message={error} onRetry={busy ? undefined : handleImport} />
        </div>
      )}
      {busy ? (
        <div className="flex flex-col gap-1 py-2">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 ease-out-strong",
                  active && "bg-bg-hover",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-xs transition-colors duration-200",
                    done && "border-success/40 bg-success/15 text-success",
                    active && "border-accent/50 bg-accent-soft text-accent",
                    !done && !active && "border-border text-content-faint",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin-fast" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    done && "text-content-secondary",
                    active && "font-medium text-content-primary",
                    !done && !active && "text-content-tertiary",
                  )}
                >
                  {t(s.labelKey)}
                </span>
              </div>
            );
          })}
          <p className="mt-2 px-3 text-xs text-content-tertiary">{t("import.longBookNote")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-6 text-center",
              "transition-[border-color,background-color,transform] duration-150 ease-out-strong active:scale-[0.99]",
              dragging
                ? "border-accent bg-accent-soft"
                : "border-border hover:border-border-strong hover:bg-bg-hover",
            )}
          >
            {file ? (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-content-primary">{file.name}</span>
                <span className="text-xs text-content-tertiary">
                  {t("import.changeFile", { size: (file.size / 1024).toFixed(1) })}
                </span>
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-hover text-content-tertiary">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-content-primary">
                  {t("import.dropHint")}
                </span>
                <span className="text-xs text-content-tertiary">{t("import.onlyMarkdown")}</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("import.authorLabel")} hint={t("import.authorHint")}>
              <Input
                placeholder={t("import.authorPlaceholder")}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </Field>
            <Field label={t("import.languageLabel")} hint={t("import.languageHint")}>
              <Input
                placeholder={t("import.languagePlaceholder")}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
