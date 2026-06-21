import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Globe,
  Image,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Upload,
  X,
  Phone,
  Mail,
  Plus,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Skeleton, ErrorBanner, Spinner } from "@/components/ui/misc";
import { getPageDetails, updatePageSettings, uploadPageCover } from "@/api/endpoints";
import { errorMessage } from "@/lib/useAsync";
import type { PageDetails, PageSettingsPatch } from "@/api/types";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EditableFields {
  about: string;
  description: string;
  website: string;
  phone: string;
  emails: string[];
  isPublished: boolean;
}

function toEditable(d: PageDetails): EditableFields {
  return {
    about: d.about ?? "",
    description: d.description ?? "",
    website: d.website ?? "",
    phone: d.phone ?? "",
    emails: d.emails ?? [],
    isPublished: d.isPublished,
  };
}

/** Email non vuote (trim), preservando l'ordine. */
function cleanEmails(emails: string[]): string[] {
  return emails.map((e) => e.trim()).filter((e) => e.length > 0);
}

function sameEmails(a: string[], b: string[]): boolean {
  const ca = cleanEmails(a);
  const cb = cleanEmails(b);
  return ca.length === cb.length && ca.every((v, i) => v === cb[i]);
}

function buildPatch(original: EditableFields, current: EditableFields): PageSettingsPatch {
  const patch: PageSettingsPatch = {};
  if (current.about !== original.about) patch.about = current.about;
  if (current.description !== original.description) patch.description = current.description;
  if (current.website !== original.website) patch.website = current.website;
  if (current.phone !== original.phone) patch.phone = current.phone;
  if (!sameEmails(original.emails, current.emails)) patch.emails = cleanEmails(current.emails);
  if (current.isPublished !== original.isPublished) patch.isPublished = current.isPublished;
  return patch;
}

function hasChanges(original: EditableFields, current: EditableFields): boolean {
  return (
    current.about !== original.about ||
    current.description !== original.description ||
    current.website !== original.website ||
    current.phone !== original.phone ||
    !sameEmails(original.emails, current.emails) ||
    current.isPublished !== original.isPublished
  );
}

// ---------------------------------------------------------------------------
// Cover uploader
// ---------------------------------------------------------------------------

function CoverUploader({
  pageId,
  pageName,
  currentCoverUrl,
  onUploaded,
}: {
  pageId: string;
  pageName: string;
  currentCoverUrl: string | null | undefined;
  onUploaded: (newUrl: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    // Revoke previous object URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setChosenFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadError(null);
    setUploadSuccess(false);
    // Reset the input so the same file can be re-selected after a clear
    e.target.value = "";
  }

  function clearChoice() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setChosenFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    setUploadSuccess(false);
  }

  async function performUpload() {
    if (!chosenFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadPageCover(pageId, chosenFile);
      if (!res.ok) {
        setUploadError(res.error ?? t("pageSettings.uploadFailed"));
        return;
      }
      setUploadSuccess(true);
      onUploaded(res.coverUrl ?? null);
      // Clear chosen file — current cover is now the uploaded one
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setChosenFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setUploadError(errorMessage(err) || t("pageSettings.uploadError"));
    } finally {
      setUploading(false);
      setConfirmOpen(false);
    }
  }

  const displayedCover = uploadSuccess ? null : currentCoverUrl;

  return (
    <div className="flex flex-col gap-2">
      {/* Current or newly-uploaded cover preview */}
      {displayedCover ? (
        <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-bg-inset">
          <img
            src={displayedCover}
            alt={t("pageSettings.coverAlt")}
            className="w-full object-cover"
            style={{ maxHeight: "160px" }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-xs text-content-faint">
          <Image className="h-4 w-4 shrink-0" />
          <span>{t("pageSettings.noCover")}</span>
        </div>
      )}

      {/* Chosen-file preview */}
      {previewUrl && chosenFile && (
        <div className="relative overflow-hidden rounded-xl border border-accent/40 bg-bg-inset animate-slide-up-in">
          <img
            src={previewUrl}
            alt={t("pageSettings.newCoverAlt")}
            className="w-full object-cover"
            style={{ maxHeight: "140px" }}
          />
          <button
            type="button"
            onClick={clearChoice}
            aria-label={t("pageSettings.removeSelectionAria")}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-bg-surface/80 text-content-secondary backdrop-blur-sm transition-colors hover:bg-bg-surface hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="px-3 py-1.5 text-xs text-content-tertiary truncate">
            {chosenFile.name}
          </div>
        </div>
      )}

      {/* File picker + action row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          aria-label={t("pageSettings.chooseCoverAria")}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
            "border-border bg-bg-surface text-content-secondary",
            "transition-[background-color,border-color] duration-150 ease-out-strong",
            "hover:border-border-hover hover:bg-bg-hover hover:text-content-primary",
            "active:scale-95",
          )}
        >
          <Image className="h-3.5 w-3.5 shrink-0" />
          {t("pageSettings.changeCover")}
        </button>

        {chosenFile && (
          <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={uploading}>
            {uploading ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="h-3.5 w-3.5" />
                {t("pageSettings.uploading")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {t("pageSettings.uploadCover")}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Hint */}
      <p className="flex items-center gap-1.5 text-xs text-content-tertiary">
        <Image className="h-3.5 w-3.5 shrink-0" />
        {t("pageSettings.coverSizeHint")}
      </p>

      {/* Upload error — persistent, never auto-dismissed */}
      {uploadError && <ErrorBanner message={uploadError} />}

      {/* Upload success */}
      {uploadSuccess && !uploadError && (
        <div className="rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success animate-slide-up-in">
          {t("pageSettings.coverUpdated")}
        </div>
      )}

      {/* Confirmation dialog */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("pageSettings.changeCoverTitle")}
        description={t("pageSettings.changeCoverDescription", { pageName })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={uploading}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={performUpload} loading={uploading}>
              {t("pageSettings.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">{t("pageSettings.changeCoverBody")}</p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visibility toggle
// ---------------------------------------------------------------------------

function VisibilityToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-3 text-left",
          "transition-[background-color,border-color] duration-150 ease-out-strong",
          value
            ? "border-success/40 bg-success/8 hover:bg-success/12"
            : "border-warning/40 bg-warning/8 hover:bg-warning/12",
        )}
        aria-pressed={value}
      >
        <span className="shrink-0 transition-colors duration-150">
          {value ? (
            <ToggleRight className="h-5 w-5 text-success" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-warning" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-medium", value ? "text-success" : "text-warning")}>
            {t(value ? "pageSettings.pagePublic" : "pageSettings.pageHidden")}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-content-tertiary">
            {t(value ? "pageSettings.pagePublicNote" : "pageSettings.pageHiddenNote")}
          </div>
        </div>
      </button>
      {!value && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2.5 animate-slide-up-in">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-xs leading-snug text-content-secondary">
            {t("pageSettings.visibilityWarning")}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-24 w-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email list editor
// ---------------------------------------------------------------------------

function EmailListEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  // Manteniamo almeno una riga vuota per consentire l'inserimento immediato.
  const rows = value.length > 0 ? value : [""];

  function updateAt(index: number, next: string) {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  }

  function removeAt(index: number) {
    const copy = rows.filter((_, i) => i !== index);
    onChange(copy);
  }

  function addRow() {
    onChange([...rows, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((email, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
            <Input
              type="email"
              value={email}
              onChange={(e) => updateAt(i, e.target.value)}
              placeholder={t("pageSettings.emailPlaceholder")}
              className="pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={t("pageSettings.removeEmailAria")}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-surface text-content-tertiary",
              "transition-[background-color,color] duration-150 ease-out-strong",
              "hover:border-danger/40 hover:bg-danger-soft hover:text-danger active:scale-95",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium",
          "text-content-secondary transition-[background-color,border-color] duration-150 ease-out-strong",
          "hover:border-border-hover hover:bg-bg-hover hover:text-content-primary active:scale-95",
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("pageSettings.addEmail")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner editor (loaded state)
// ---------------------------------------------------------------------------

function EditorForm({
  details,
  onSaved,
}: {
  details: PageDetails;
  onSaved: (refreshed: PageDetails) => void;
}) {
  const { t } = useTranslation();
  const original = toEditable(details);
  const [fields, setFields] = useState<EditableFields>(original);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [liveCoverUrl, setLiveCoverUrl] = useState<string | null | undefined>(details.cover?.url);

  const changed = hasChanges(original, fields);

  function set<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
    setSaveSuccess(false);
  }

  async function performSave() {
    const patch = buildPatch(original, fields);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await updatePageSettings(details.pageId, patch);
      if (!res.ok) {
        setSaveError(res.error ?? t("pageSettings.saveFailed"));
        return;
      }
      setSaveSuccess(true);
      // Merge updated fields back so "original" now matches saved state
      const refreshed: PageDetails = {
        ...details,
        about: "about" in patch ? (patch.about ?? null) : details.about,
        description: "description" in patch ? (patch.description ?? null) : details.description,
        website: "website" in patch ? (patch.website ?? null) : details.website,
        phone: "phone" in patch ? (patch.phone ?? null) : details.phone,
        emails: "emails" in patch ? (patch.emails ?? []) : details.emails,
        isPublished:
          "isPublished" in patch ? (patch.isPublished ?? details.isPublished) : details.isPublished,
      };
      onSaved(refreshed);
    } catch (err) {
      setSaveError(errorMessage(err) || t("pageSettings.saveError"));
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cover uploader */}
      <CoverUploader
        pageId={details.pageId}
        pageName={details.name}
        currentCoverUrl={liveCoverUrl}
        onUploaded={(newUrl) => setLiveCoverUrl(newUrl)}
      />

      {/* About */}
      <Field label={t("pageSettings.aboutLabel")}>
        <Input
          value={fields.about}
          onChange={(e) => set("about", e.target.value)}
          placeholder={t("pageSettings.aboutPlaceholder")}
          maxLength={255}
        />
      </Field>

      {/* Description */}
      <Field label={t("pageSettings.descriptionLabel")}>
        <Textarea
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={t("pageSettings.descriptionPlaceholder")}
          rows={4}
        />
      </Field>

      {/* Website */}
      <Field label={t("pageSettings.websiteLabel")}>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
          <Input
            type="url"
            value={fields.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://..."
            className="pl-9"
          />
        </div>
      </Field>

      {/* Phone */}
      <Field label={t("pageSettings.phoneLabel")}>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
          <Input
            type="tel"
            value={fields.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+39 ..."
            className="pl-9"
          />
        </div>
      </Field>

      {/* Emails */}
      <Field label={t("pageSettings.emailsLabel")} hint={t("pageSettings.emailsHint")}>
        <EmailListEditor value={fields.emails} onChange={(next) => set("emails", next)} />
      </Field>

      {/* Visibility */}
      <Field label={t("pageSettings.visibilityLabel")} hint={t("pageSettings.visibilityHint")}>
        <VisibilityToggle value={fields.isPublished} onChange={(v) => set("isPublished", v)} />
      </Field>

      {/* In-place error */}
      {saveError && <ErrorBanner message={saveError} />}

      {/* In-place success */}
      {saveSuccess && !saveError && (
        <div className="rounded-lg border border-success/30 bg-success/8 px-4 py-3 text-sm text-success animate-slide-up-in">
          {t("pageSettings.changesSaved")}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-1">
        <Button variant="primary" disabled={!changed} onClick={() => setConfirmOpen(true)}>
          {t("pageSettings.saveChanges")}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("pageSettings.confirmChangesTitle")}
        description={t("pageSettings.confirmChangesDescription", { pageName: details.name })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={performSave} loading={saving}>
              {t("pageSettings.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">{t("pageSettings.confirmChangesBody")}</p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

// Pannello impostazioni INLINE (niente modale): carica i dettagli al mount e mostra
// direttamente il form. Le conferme su salvataggio/copertina restano modali (azioni reali
// sulla pagina Facebook pubblica).
export function PageSettingsEditor({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<PageDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      getPageDetails(pageId, signal)
        .then((d) => {
          setDetails(d);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setLoadError(errorMessage(err) || t("pageSettings.loadFailed"));
          setLoading(false);
        });
    },
    [pageId, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading) return <EditorSkeleton />;
  if (loadError) return <ErrorBanner message={loadError} onRetry={() => load()} />;
  if (!details) return null;
  return <EditorForm details={details} onSaved={setDetails} />;
}
