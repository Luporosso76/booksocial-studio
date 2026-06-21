import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Clock,
  Pencil,
  RefreshCw,
  X,
  Check,
  Save,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea, selectClass } from "@/components/ui/Input";
import { Badge, EmptyState, ErrorBanner, Skeleton, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { contentFormatBadges } from "@/lib/labels";
import { FacebookPreview, scheduledAtLabel, expectsVisual } from "@/components/FacebookPreview";
import {
  addSlot,
  cancelWeekGen,
  deleteDraft,
  deleteSlot,
  generateWeek,
  getBooks,
  getPagePosts,
  getPages,
  getSlots,
  getWeekGenStatus,
  getWeeklyPlan,
  publishPost,
  regenerateDraft,
  saveWeeklyPlan,
  scheduleDrafts,
  updateDraft,
} from "@/api/endpoints";
import type {
  Book,
  FacebookPage,
  GeneratePeriod,
  PostingSlot,
  PostingSlotInput,
  ScheduleDraftsResult,
  ScheduledPost,
  SlotDayOfWeek,
  WeekGenStatus,
  WeeklyPlan,
} from "@/api/types";
import { HashtagBreakdown } from "./HashtagBreakdown";
import { useJobs } from "@/lib/jobs";

// Giorni numerici 1=Lunedi … 7=Domenica (contratto API slot). Le etichette sono
// risolte via i18n (planner.day*/planner.dayShort*) al momento del render.
const DAYS: { value: SlotDayOfWeek; labelKey: string; shortKey: string }[] = [
  { value: 1, labelKey: "planner.dayMon", shortKey: "planner.dayShortMon" },
  { value: 2, labelKey: "planner.dayTue", shortKey: "planner.dayShortTue" },
  { value: 3, labelKey: "planner.dayWed", shortKey: "planner.dayShortWed" },
  { value: 4, labelKey: "planner.dayThu", shortKey: "planner.dayShortThu" },
  { value: 5, labelKey: "planner.dayFri", shortKey: "planner.dayShortFri" },
  { value: 6, labelKey: "planner.daySat", shortKey: "planner.dayShortSat" },
  { value: 7, labelKey: "planner.daySun", shortKey: "planner.dayShortSun" },
];
const DAY_SHORT_KEY: Record<number, string> = Object.fromEntries(
  DAYS.map((d) => [d.value, d.shortKey]),
);

// Descrizione leggibile dell'orario di uno slot: fascia "18:00–21:00" se presenti
// timeStart+timeEnd, altrimenti l'orario singolo, altrimenti placeholder.
function slotTimeLabel(
  s: PostingSlot,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (s.timeStart && s.timeEnd) return `${s.timeStart}–${s.timeEnd}`;
  if (s.timeStart) return t("planner.slotFrom", { time: s.timeStart });
  return s.timeOfDay ?? "—";
}

// ---------------------------------------------------------------------------
// Hashtag helpers: la card mostra base/specifici/finali, ma l'editor lavora su
// una lista piatta. Usiamo i "finali" se presenti, altrimenti gli specifici.
// ---------------------------------------------------------------------------

function draftEditableHashtags(d: ScheduledPost): string[] {
  const f = d.finalHashtags ?? [];
  if (f.length > 0) return f;
  return d.specificHashtags ?? [];
}

function parseHashtagsInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, ""))
    .filter((t) => t.length > 0);
}

/** Data odierna in formato YYYY-MM-DD (ora locale), per <input type="date">. */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** epoch ms → valore per <input type="datetime-local"> (ora locale). */
function toDateTimeLocal(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Pubblica adesso: pubblicazione UNIFICATA REALE e IMMEDIATA della bozza CON il
// suo media (foto→post-foto, video→Reel, storia→story, altrimenti testo). Ingloba
// la vecchia "Pubblica come Storia". Azione reale → MODALE DI CONFERMA esplicito.
// La programmazione in blocco è gestita altrove (pulsante "Programma pubblicazione").
// Esito ed errori sempre in-place (nessun toast auto-dismiss).
// ---------------------------------------------------------------------------

function PublishControl({
  draft,
  pageName,
  onPublished,
}: {
  draft: ScheduledPost;
  pageName: string;
  onPublished: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Esito in-place: pubblicazione immediata avvenuta.
  const [published, setPublished] = useState(false);

  // Il visual è atteso ma non ancora pronto: disabilita la pubblicazione.
  const visualPending = expectsVisual(draft) && !draft.hasMedia;
  const kindLabel = draftKindLabel(draft);

  function openConfirm() {
    setError(null);
    setConfirmOpen(true);
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      // Senza scheduledAt → pubblica ADESSO.
      await publishPost(draft.id);
      setPublished(true);
      setConfirmOpen(false);
      // La bozza pubblicata passa a PUBLISHED e in genere esce dalla lista.
      onPublished();
    } catch (err) {
      setError(errorMessage(err) || "Pubblicazione non riuscita.");
    } finally {
      setPublishing(false);
    }
  }

  // Esito positivo persistente, in-place (sostituisce il pulsante).
  if (published) {
    return (
      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-snug">Pubblicato ✓</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <Button
        variant="primary"
        size="sm"
        onClick={openConfirm}
        disabled={publishing || visualPending}
        title={visualPending ? "Visual in generazione…" : undefined}
      >
        <Send className="h-4 w-4" />
        Pubblica adesso
      </Button>
      {visualPending && (
        <p className="mt-1.5 text-xs text-content-tertiary">Visual in generazione…</p>
      )}

      {/* Errore di pubblicazione (fuori dal modale), in-place e persistente. */}
      {!confirmOpen && error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (publishing) return;
          setConfirmOpen(false);
        }}
        size="sm"
        title={`Pubblica ${kindLabel}`}
        description="Pubblicazione reale e immediata su Facebook."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={publishing}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handlePublish} loading={publishing}>
              <Send className="h-4 w-4" />
              Pubblica adesso
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm leading-snug text-content-primary">
              Stai per pubblicare DAVVERO su Facebook, sulla pagina «{pageName}». Azione reale e
              immediata.
            </p>
          </div>

          {error && <ErrorBanner message={error} />}
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card di una singola bozza con azioni Modifica / Elimina / Rigenera
// ---------------------------------------------------------------------------

function DraftCard({
  draft,
  pageName,
  onUpdated,
  onDeleted,
  onRenderDone,
}: {
  draft: ScheduledPost;
  pageName: string;
  onUpdated: (updated: ScheduledPost) => void;
  onDeleted: (id: string) => void;
  onRenderDone: () => void;
}) {
  const { onPostRenderDone, refresh: refreshJobs } = useJobs();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campi dell'editor inline (inizializzati all'apertura).
  const [message, setMessage] = useState(draft.body ?? "");
  const [hashtags, setHashtags] = useState(
    draftEditableHashtags(draft)
      .map((t) => `#${t.replace(/^#+/, "")}`)
      .join(" "),
  );
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(draft.scheduledAt));

  const busy = saving || deleting || regenerating;

  // Quando il render del visual di questa bozza esce dalla coda (completato o
  // fallito), ricarica la lista bozze così mediaUrl/mediaKind si popolano e
  // l'anteprima Facebook sostituisce il placeholder "in generazione".
  useEffect(() => {
    return onPostRenderDone(draft.id, onRenderDone);
  }, [draft.id, onPostRenderDone, onRenderDone]);

  function openEditor() {
    setMessage(draft.body ?? "");
    setHashtags(
      draftEditableHashtags(draft)
        .map((t) => `#${t.replace(/^#+/, "")}`)
        .join(" "),
    );
    setScheduledAt(toDateTimeLocal(draft.scheduledAt));
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const patch: {
        message?: string;
        hashtags?: string[];
        scheduledAt?: number;
      } = {
        message,
        hashtags: parseHashtagsInput(hashtags),
      };
      const trimmed = scheduledAt.trim();
      if (trimmed) {
        const ms = new Date(trimmed).getTime();
        if (!Number.isNaN(ms)) patch.scheduledAt = ms;
      }
      const updated = await updateDraft(draft.id, patch);
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err) || "Modifica non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteDraft(draft.id);
      onDeleted(draft.id);
    } catch (err) {
      setError(errorMessage(err) || "Eliminazione non riuscita.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const updated = await regenerateDraft(draft.id, draft.angle ?? undefined);
      onUpdated(updated);
      // "Rigenera" ri-renderizza anche il visual (video/foto + musica) in modo ASINCRONO:
      // forza un poll immediato dei job così la coda render appena accodata viene catturata,
      // e onPostRenderDone ricaricherà il media aggiornato quando il render finisce.
      refreshJobs();
    } catch (err) {
      setError(errorMessage(err) || "Rigenerazione non riuscita.");
    } finally {
      setRegenerating(false);
    }
  }

  const scheduleLabel = scheduledAtLabel(draft.scheduledAt);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-inset p-4">
      {/* Anteprima fedele "tipo post Facebook": come apparirà il post. In aggiunta
          all'editor, non lo sostituisce. Nascosta mentre si modifica la bozza. */}
      {!editing && <FacebookPreview draft={draft} pageName={pageName} />}

      {scheduleLabel && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-content-secondary">
          <Clock className="h-3.5 w-3.5 text-content-tertiary" />
          {scheduleLabel}
        </div>
      )}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tipo di pubblicazione: Post / Reel / Storia (badge prominente). */}
          <Badge tone="accent">{draftKindLabel(draft)}</Badge>
          {draft.angle && <Badge tone="neutral">{draft.angle}</Badge>}
          {/* Formato editoriale scelto dalla generazione (badge leggibili in italiano). */}
          {contentFormatBadges(draft.contentFormat).map((b) => (
            <Badge key={b} tone="neutral">
              {b}
            </Badge>
          ))}
        </div>
        {draft.status === "SCHEDULED" ? (
          <Badge tone="success">Programmato</Badge>
        ) : (
          <Badge tone="neutral">{draft.status}</Badge>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="Testo">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Testo della bozza…"
            />
          </Field>
          <Field label="Hashtag" hint="Separati da spazio o virgola.">
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#esempio #libro"
            />
          </Field>
          <Field label="Data e ora" hint="Opzionale.">
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              <X className="h-4 w-4" />
              Annulla
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              <Check className="h-4 w-4" />
              Salva
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Il testo del post è già nell'anteprima Facebook in cima alla card;
              qui sotto restano dettaglio hashtag, azioni e generazione visual. */}
          {regenerating && (
            <div className="mt-2 flex items-center gap-2 text-xs text-content-tertiary">
              <Spinner className="h-3.5 w-3.5" />
              Rigenerazione in corso…
            </div>
          )}
          <HashtagBreakdown
            base={draft.baseHashtags}
            specific={draft.specificHashtags}
            final={draft.finalHashtags}
          />

          {error && (
            <div className="mt-3">
              <ErrorBanner message={error} />
            </div>
          )}

          {confirmingDelete ? (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
              <p className="text-xs text-content-secondary">
                Eliminare definitivamente questa bozza?
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Annulla
                </Button>
                <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Elimina
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
              <Button variant="secondary" size="sm" onClick={openEditor} disabled={busy}>
                <Pencil className="h-4 w-4" />
                Modifica
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={regenerating}
                disabled={busy}
                onClick={handleRegenerate}
              >
                <RefreshCw className="h-4 w-4" />
                Rigenera
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setConfirmingDelete(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Elimina
              </Button>
            </div>
          )}

          {/* Pubblica / Programma: pubblicazione unificata REALE della bozza CON il
              suo media (ingloba la vecchia "Pubblica come Storia"). */}
          <PublishControl draft={draft} pageName={pageName} onPublished={onRenderDone} />
        </>
      )}
    </div>
  );
}

// Tipo di pubblicazione leggibile: Reel / Storia / Post (in base a mediaType e visualKind).
function draftKindLabel(d: ScheduledPost): string {
  const vk = d.contentFormat?.visualKind;
  if (d.mediaType === "REEL" || vk === "reel") return "Reel";
  if (d.mediaType === "STORY" || vk === "story") return "Storia";
  return "Post";
}

// ---------------------------------------------------------------------------
// Editor "Quote settimanali": l'utente imposta solo QUANTE pubblicazioni vuole a
// settimana (post/reel/storie); il motore backend decide giorni, orari e formati.
// ---------------------------------------------------------------------------

const QUOTA_FIELDS: { key: keyof WeeklyPlan; labelKey: string }[] = [
  { key: "postsPerWeek", labelKey: "planner.quotaPosts" },
  { key: "reelsPerWeek", labelKey: "planner.quotaReels" },
  { key: "storiesPerWeek", labelKey: "planner.quotaStories" },
];

function WeeklyPlanEditor({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const planState = useAsync<WeeklyPlan>((s) => getWeeklyPlan(pageId, s), [pageId]);

  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (planState.data) setPlan(planState.data);
  }, [planState.data]);

  function setField(key: keyof WeeklyPlan, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setPlan((prev) => (prev ? { ...prev, [key]: n } : prev));
  }

  async function persist() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveWeeklyPlan(pageId, plan);
      setPlan(saved);
    } catch (err) {
      setError(errorMessage(err) || "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Quote settimanali"
        description="Imposta quante pubblicazioni vuoi: il motore decide automaticamente giorni, orari e formati."
        action={
          <Button variant="secondary" size="sm" loading={saving} disabled={!plan} onClick={persist}>
            <Save className="h-4 w-4" />
            Salva
          </Button>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {planState.loading && !plan ? (
          <Skeleton className="h-9 w-full" />
        ) : planState.error && !plan ? (
          <ErrorBanner message={planState.error} onRetry={planState.reload} />
        ) : plan ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {QUOTA_FIELDS.map((f) => (
                <Field key={f.key} label={t("planner.quotaPerWeek", { label: t(f.labelKey) })}>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={String(plan[f.key])}
                    onChange={(e) => setField(f.key, e.target.value)}
                    onBlur={persist}
                    disabled={saving}
                  />
                </Field>
              ))}
            </div>
            {error && <ErrorBanner message={error} />}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Programma pubblicazione (in blocco): porta TUTTE le bozze DRAFT della pagina con
// orario futuro a SCHEDULED; un job interno le pubblica alle loro date/ore. NON
// pubblica nulla adesso. Azione importante → MODALE DI CONFERMA esplicito con
// avviso che l'app/il server deve restare in esecuzione. Esito/errori in-place.
// ---------------------------------------------------------------------------

function ScheduleAllControl({
  pageId,
  pageName,
  onScheduled,
}: {
  pageId: string;
  pageName: string;
  onScheduled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScheduleDraftsResult | null>(null);

  function openConfirm() {
    setError(null);
    setResult(null);
    setConfirmOpen(true);
  }

  async function handleSchedule() {
    setScheduling(true);
    setError(null);
    try {
      const res = await scheduleDrafts(pageId);
      setResult(res);
      setConfirmOpen(false);
      // Le bozze programmate passano a SCHEDULED: ricarica la lista.
      onScheduled();
    } catch (err) {
      setError(errorMessage(err) || "Programmazione non riuscita.");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" size="sm" onClick={openConfirm} disabled={scheduling}>
        <CalendarClock className="h-4 w-4" />
        Programma pubblicazione
      </Button>

      {/* Esito in-place dell'ultima programmazione. */}
      {result && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-snug">
            {result.scheduled} contenuti programmati
            {typeof result.fbScheduled === "number" &&
              result.fbScheduled > 0 &&
              ` · ${result.fbScheduled} su Facebook`}
            {typeof result.jobScheduled === "number" &&
              result.jobScheduled > 0 &&
              ` · ${result.jobScheduled} via job interno (reel/storie)`}
            {result.skipped > 0 && ` · ${result.skipped} saltati: orario già passato`}
          </span>
        </div>
      )}

      {/* Errore in-place (fuori dal modale). */}
      {!confirmOpen && error && <ErrorBanner message={error} />}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (scheduling) return;
          setConfirmOpen(false);
        }}
        size="sm"
        title="Programma pubblicazione"
        description="Programmazione in blocco di tutte le bozze."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={scheduling}>
              Annulla
            </Button>
            <Button variant="primary" onClick={handleSchedule} loading={scheduling}>
              <CalendarClock className="h-4 w-4" />
              Programma tutto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-snug text-content-primary">
            Stai per PROGRAMMARE la pubblicazione di tutte le bozze della pagina «{pageName}
            », alle date e agli orari generati. I <strong>post (testo/foto)</strong> vengono
            programmati <strong>direttamente su Facebook</strong> (li pubblica Facebook, anche ad
            app spenta). I <strong>reel</strong> e le <strong>storie</strong> li pubblica un
            <strong> job interno</strong> al loro orario (Facebook non li può programmare).
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm leading-snug text-content-primary">
              ⚠️ Solo per <strong>reel e storie</strong>: l'app/il server deve restare in esecuzione
              al loro orario, altrimenti non partono. I post su Facebook partono comunque.
            </p>
          </div>

          {error && <ErrorBanner message={error} />}
        </div>
      </Modal>
    </div>
  );
}

export function PlannerScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);
  const booksState = useAsync<Book[]>((s) => getBooks(s), []);

  const [pageId, setPageId] = useState("");
  const [bookId, setBookId] = useState("");

  const slotsState = useAsync<PostingSlot[]>(
    (s) => (pageId ? getSlots(pageId, s) : Promise.resolve([])),
    [pageId],
  );

  const [day, setDay] = useState<SlotDayOfWeek>(1);
  const [slotMode, setSlotMode] = useState<"single" | "range">("single");
  const [time, setTime] = useState("09:00");
  const [timeStart, setTimeStart] = useState("18:00");
  const [timeEnd, setTimeEnd] = useState("21:00");
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Stato della generazione settimana (asincrona, in background lato server).
  // `weekGen` è l'ultimo stato letto via polling; `weekGenError` raccoglie gli
  // errori in-place dell'avvio o del polling; `alreadyRunning` mostra l'avviso
  // "una generazione è già in corso". Il polling si chiude su unmount/cambio pagina.
  const [weekGen, setWeekGen] = useState<WeekGenStatus | null>(null);
  const [weekGenError, setWeekGenError] = useState<string | null>(null);
  const [alreadyRunning, setAlreadyRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancellingWeek, setCancellingWeek] = useState(false);

  // Periodo di generazione: settimana (default), mese o range personalizzato.
  // Per `custom` servono due date (Da/A), inizializzate a oggi.
  const [periodKind, setPeriodKind] = useState<GeneratePeriod["kind"]>("week");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());

  // Validazione range custom: la fine non può precedere l'inizio.
  const customRangeInvalid =
    periodKind === "custom" && !!customStart && !!customEnd && customEnd < customStart;

  // Carica le bozze GIÀ ESISTENTI della pagina (non solo quelle appena generate):
  // così le ritrovi anche dopo un reload o se generate in una sessione precedente.
  const postsState = useAsync<ScheduledPost[]>(
    (s) => (pageId ? getPagePosts(pageId, s) : Promise.resolve([])),
    [pageId],
  );

  // Bozze in stato locale (modificabili/rimovibili). Sorgente: SOLO i post DRAFT della
  // pagina. Appena un contenuto è programmato/pubblicato esce dal Pianificatore (i
  // programmati in coda al job interno vivono nella vista "Programmati").
  const [drafts, setDrafts] = useState<ScheduledPost[]>([]);
  useEffect(() => {
    const all = postsState.data ?? [];
    const filtered = all.filter((p) => p.status === "DRAFT");
    // Palinsesto in ordine cronologico: per scheduledAt crescente (bozze senza
    // data in coda), così la lista riflette quando il motore pubblicherà.
    filtered.sort(
      (a, b) =>
        (a.scheduledAt ?? Number.POSITIVE_INFINITY) - (b.scheduledAt ?? Number.POSITIVE_INFINITY),
    );
    setDrafts(filtered);
  }, [postsState.data]);

  // Polling leggero di sicurezza: finché esiste almeno una bozza che prevede un
  // visual ma non ha ancora mediaUrl (render in corso, magari avviato prima del
  // mount e quindi non rilevabile via onPostRenderDone), ricarica la lista ogni
  // ~4s. Si ferma da solo appena tutti i visual attesi sono pronti.
  const awaitingVisual = drafts.some((d) => expectsVisual(d) && !d.mediaUrl);
  const reloadPosts = postsState.reload;
  useEffect(() => {
    if (!awaitingVisual) return;
    const id = window.setInterval(() => reloadPosts(), 4000);
    return () => window.clearInterval(id);
  }, [awaitingVisual, reloadPosts]);

  // Polling della generazione settimana. `pollActive` accende un interval (~3s)
  // che legge lo stato (getWeekGenStatus) e ricarica le bozze, così compaiono
  // una a una. Si spegne da solo a 'ready'/'failed' e su unmount/cambio pagina.
  const [pollActive, setPollActive] = useState(false);
  const reloadPostsRef = useRef(postsState.reload);
  reloadPostsRef.current = postsState.reload;

  // Resume: all'apertura del Pianificatore o al cambio pagina, controlla se una
  // generazione è già in corso lato server e, se sì, entra subito in avanzamento.
  useEffect(() => {
    if (!pageId) {
      setWeekGen(null);
      setWeekGenError(null);
      setAlreadyRunning(false);
      setPollActive(false);
      setCancellingWeek(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    getWeekGenStatus(pageId, controller.signal)
      .then((status) => {
        if (!active) return;
        setWeekGen(status);
        if (status.status === "generating") {
          setAlreadyRunning(false);
          setWeekGenError(null);
          setPollActive(true);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Stato non disponibile: non blocca la UI, niente avanzamento.
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pageId]);

  // Interval di polling vero e proprio, attivo solo mentre `pollActive`.
  useEffect(() => {
    if (!pollActive || !pageId) return;
    let active = true;
    let controller: AbortController | null = null;

    const tick = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const status = await getWeekGenStatus(pageId, controller.signal);
        if (!active) return;
        setWeekGen(status);
        // Le bozze compaiono progressivamente: ricarica a ogni giro.
        reloadPostsRef.current();
        if (status.status === "ready" || status.status === "failed") {
          setPollActive(false);
          setCancellingWeek(false);
          // Ricarica un'ultima volta per assicurare la lista completa.
          reloadPostsRef.current();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Errore transitorio: riprova al giro successivo.
      }
    };

    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [pollActive, pageId]);

  function replaceDraft(updated: ScheduledPost) {
    setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  const pages = pagesState.data ?? [];
  const books = booksState.data ?? [];
  const slots = slotsState.data ?? [];

  // Nome della pagina selezionata, per l'header dell'anteprima Facebook.
  // Fallback generico se non disponibile (nessuna pagina scelta / non trovata).
  const pageName = pages.find((p) => p.id === pageId)?.name ?? "La tua Pagina";

  async function handleAddSlot() {
    if (!pageId) {
      setSlotError("Seleziona prima una pagina.");
      return;
    }
    // Validazione fascia: la fine deve essere successiva all'inizio.
    if (slotMode === "range" && timeStart >= timeEnd) {
      setSlotError("L'orario di fine deve essere successivo a quello di inizio.");
      return;
    }
    setSlotError(null);
    setAddingSlot(true);
    try {
      const body: PostingSlotInput =
        slotMode === "range"
          ? { dayOfWeek: day, timeStart, timeEnd }
          : { dayOfWeek: day, timeOfDay: time };
      await addSlot(pageId, body);
      slotsState.reload();
      toast.success("Finestra aggiunta.");
    } catch (err) {
      setSlotError(errorMessage(err) || "Operazione non riuscita.");
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    try {
      await deleteSlot(slotId);
      slotsState.reload();
      toast.success("Finestra rimossa.");
    } catch (err) {
      toast.error(errorMessage(err) || "Rimozione non riuscita.");
    }
  }

  async function handleGenerate() {
    if (!pageId || !bookId) {
      toast.error("Seleziona pagina e libro.");
      return;
    }
    if (customRangeInvalid) {
      toast.error("La data di fine non può precedere quella di inizio.");
      return;
    }
    setStarting(true);
    setWeekGenError(null);
    setAlreadyRunning(false);
    try {
      // week/month: inviamo solo { kind } (start default oggi lato server);
      // custom: inviamo l'intero range scelto.
      const period: GeneratePeriod =
        periodKind === "custom"
          ? { kind: "custom", start: customStart, end: customEnd }
          : { kind: periodKind };
      const res = await generateWeek(pageId, bookId, period);
      if (res.alreadyRunning) {
        // Una generazione è già in corso per questa pagina: mostra l'avviso e
        // aggancia comunque il polling per seguirne l'avanzamento.
        setAlreadyRunning(true);
        setPollActive(true);
        return;
      }
      if (res.started) {
        // Entra in modalità "generazione in corso": stato iniziale + polling.
        setWeekGen((prev) =>
          prev && prev.status === "generating"
            ? prev
            : {
                status: "generating",
                planned: 0,
                created: 0,
                reason: null,
                messages: null,
                error: null,
                startedAt: Date.now(),
              },
        );
        setPollActive(true);
        postsState.reload();
        toast.success("Generazione avviata.");
      }
    } catch (err) {
      setWeekGenError(errorMessage(err) || "Generazione non riuscita.");
      toast.error(errorMessage(err) || "Generazione non riuscita.");
    } finally {
      setStarting(false);
    }
  }

  // Annulla la generazione settimana in corso: il job si ferma al prossimo
  // contenuto (le bozze già create restano) e il polling esistente rileverà il
  // passaggio a 'ready', riportando anche `cancellingWeek` a false.
  async function handleCancelWeek() {
    if (!pageId) return;
    setCancellingWeek(true);
    setWeekGenError(null);
    try {
      await cancelWeekGen(pageId);
      toast.info("Annullamento in corso…");
    } catch (err) {
      setCancellingWeek(false);
      toast.error(errorMessage(err) || "Annullamento non riuscito.");
    }
  }

  const hasPages = !pagesState.loading && pages.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Pianifica la settimana"
          description="Scegli pagina e libro, imposta le quote, poi genera le bozze."
        />
        <CardBody className="flex flex-col gap-4">
          {pagesState.error ? (
            <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
          ) : !hasPages && !pagesState.loading ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="Nessuna pagina connessa"
              description="Connetti almeno una pagina per pianificare i post."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Pagina">
                <select
                  className={selectClass}
                  value={pageId}
                  onChange={(e) => {
                    setPageId(e.target.value);
                  }}
                >
                  <option value="">Seleziona pagina</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Libro">
                <select
                  className={selectClass}
                  value={bookId}
                  onChange={(e) => {
                    setBookId(e.target.value);
                  }}
                >
                  <option value="">Seleziona libro</option>
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </CardBody>
      </Card>

      {pageId && <WeeklyPlanEditor pageId={pageId} />}

      {pageId && (
        <Card>
          <CardHeader
            title="Finestre orarie"
            description="Quando è ok pubblicare. Il motore sceglie gli orari dentro queste fasce (se vuote, usa default)."
          />
          <CardBody className="flex flex-col gap-3">
            {slotsState.loading ? (
              <Skeleton className="h-12 w-full" />
            ) : slots.length === 0 ? (
              <p className="text-sm text-content-tertiary">
                Nessuna finestra. Aggiungine una qui sotto.
              </p>
            ) : (
              <div className="flex flex-col gap-2 stagger">
                {slots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-hover text-content-tertiary">
                        <Clock className="h-4 w-4" />
                      </span>
                      <div>
                        <span className="text-sm font-medium text-content-primary">
                          {DAY_SHORT_KEY[s.dayOfWeek] ? t(DAY_SHORT_KEY[s.dayOfWeek]) : s.dayOfWeek}{" "}
                          {slotTimeLabel(s, t)}
                        </span>
                        {s.timeStart && s.timeEnd && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge tone="accent">Fascia</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSlot(s.id)}
                      aria-label="Rimuovi finestra"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              {/* Modalità orario: singolo oppure fascia (inizio + fine). */}
              <div className="inline-flex w-fit rounded-lg border border-border bg-bg-inset p-0.5">
                {(["single", "range"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSlotMode(mode);
                      setSlotError(null);
                    }}
                    aria-pressed={slotMode === mode}
                    className={
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out-strong " +
                      (slotMode === mode
                        ? "bg-accent-soft text-accent"
                        : "text-content-tertiary hover:text-content-secondary")
                    }
                  >
                    {mode === "single" ? "Orario singolo" : "Fascia oraria"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  className={selectClass}
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value) as SlotDayOfWeek)}
                >
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {t(d.labelKey)}
                    </option>
                  ))}
                </select>

                {slotMode === "single" ? (
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="Orario"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="time"
                      value={timeStart}
                      onChange={(e) => {
                        setTimeStart(e.target.value);
                        setSlotError(null);
                      }}
                      aria-label="Inizio fascia"
                    />
                    <Input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => {
                        setTimeEnd(e.target.value);
                        setSlotError(null);
                      }}
                      aria-label="Fine fascia"
                    />
                  </div>
                )}

                <Button variant="secondary" loading={addingSlot} onClick={handleAddSlot}>
                  <Plus className="h-4 w-4" />
                  Finestra
                </Button>
              </div>

              {slotError && <ErrorBanner message={slotError} />}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Genera i contenuti"
          description="Crea il palinsesto: il motore decide giorni, orari e formati ed evita duplicati."
          action={
            <div className="flex flex-wrap items-start justify-end gap-2">
              {/* Programma in blocco tutte le bozze generate (post/reel/storie). */}
              {pageId && drafts.length > 0 && (
                <ScheduleAllControl
                  pageId={pageId}
                  pageName={pageName}
                  onScheduled={postsState.reload}
                />
              )}
              <Button
                variant="primary"
                loading={starting}
                disabled={
                  !pageId || !bookId || customRangeInvalid || weekGen?.status === "generating"
                }
                onClick={handleGenerate}
              >
                <Sparkles className="h-4 w-4" />
                Genera
              </Button>
            </div>
          }
        />
        <CardBody>
          {/* Selettore periodo: settimana (default), mese o range personalizzato. */}
          <div className="mb-4 flex flex-col gap-2 border-b border-border-subtle pb-4">
            <div className="inline-flex w-fit rounded-lg border border-border bg-bg-inset p-0.5">
              {(
                [
                  { kind: "week", label: "Settimana" },
                  { kind: "month", label: "Mese" },
                  { kind: "custom", label: "Personalizzato" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => setPeriodKind(opt.kind)}
                  aria-pressed={periodKind === opt.kind}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out-strong " +
                    (periodKind === opt.kind
                      ? "bg-accent-soft text-accent"
                      : "text-content-tertiary hover:text-content-secondary")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {periodKind === "custom" && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Da">
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      aria-label="Data di inizio"
                    />
                  </Field>
                  <Field label="A">
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      aria-label="Data di fine"
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        const t = todayISO();
                        setCustomStart(t);
                        setCustomEnd(t);
                      }}
                    >
                      Oggi
                    </Button>
                  </div>
                </div>
                {customRangeInvalid && (
                  <ErrorBanner message="La data di fine non può precedere quella di inizio." />
                )}
              </div>
            )}
          </div>

          {postsState.loading && drafts.length === 0 && !weekGen ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : postsState.error ? (
            <ErrorBanner message={postsState.error} onRetry={postsState.reload} />
          ) : (
            <div className="flex flex-col gap-3">
              {/* Avviso: una generazione è già in corso per questa pagina. */}
              {alreadyRunning && (
                <div className="rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5 text-sm text-content-secondary">
                  Una generazione è già in corso per questa pagina.
                </div>
              )}

              {/* Errore di avvio o di polling della generazione. */}
              {weekGenError && <ErrorBanner message={weekGenError} />}

              {/* Banner avanzamento: generazione in corso, bozze che compaiono una a una. */}
              {weekGen?.status === "generating" && (
                <div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent">
                  <Spinner className="h-4 w-4" />
                  <span className="flex-1">
                    {weekGen.planned > 0
                      ? `Generazione in corso… ${weekGen.created}/${weekGen.planned}`
                      : "Generazione in corso…"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={cancellingWeek}
                    disabled={cancellingWeek}
                    onClick={handleCancelWeek}
                  >
                    {!cancellingWeek && <X className="h-4 w-4" />}
                    Annulla
                  </Button>
                </div>
              )}

              {/* Esito della generazione (a 'ready'): create/saltate o nessuna bozza. */}
              {weekGen?.status === "ready" && weekGen.created > 0 && (
                <div className="flex items-center gap-2 text-sm text-content-tertiary">
                  <Badge tone="success">{weekGen.created} create</Badge>
                  {weekGen.reason && (
                    <span className="text-content-tertiary">{weekGen.reason}</span>
                  )}
                </div>
              )}
              {weekGen?.status === "ready" && weekGen.created === 0 && (
                <div className="flex flex-col gap-2">
                  <EmptyState
                    title="Nessuna bozza creata"
                    description={
                      weekGen.reason || "Imposta le quote o verifica le associazioni del libro."
                    }
                  />
                  {weekGen.messages && weekGen.messages.length > 0 && (
                    <ul className="mx-auto max-w-md list-disc space-y-1 pl-5 text-xs text-content-tertiary">
                      {weekGen.messages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Generazione fallita: mostra l'errore in-place. */}
              {weekGen?.status === "failed" && (
                <ErrorBanner message={weekGen.error || "Generazione non riuscita."} />
              )}

              {/* Tutte le bozze della pagina (esistenti + appena generate) */}
              {drafts.length > 0 ? (
                <div className="flex flex-col gap-3 stagger">
                  {drafts.map((d) => (
                    <DraftCard
                      key={d.id}
                      draft={d}
                      pageName={pageName}
                      onUpdated={replaceDraft}
                      onDeleted={removeDraft}
                      onRenderDone={postsState.reload}
                    />
                  ))}
                </div>
              ) : (
                !weekGen && (
                  <EmptyState
                    icon={<Sparkles className="h-5 w-5" />}
                    title="Nessuna bozza"
                    description={
                      pageId
                        ? "Imposta le quote, scegli il periodo e premi Genera."
                        : "Seleziona pagina e libro, imposta le quote e premi Genera."
                    }
                  />
                )
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
