import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, Facebook, Instagram } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorBanner, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/useAsync";
import { getScheduledPosts, getBooks } from "@/api/endpoints";
import type { Book, ScheduledPost } from "@/api/types";

// Palette pastel-neon leggibile su scuro (famiglia Tailwind *-400): 12 tinte
// MAX-DISTINTE, ordinate perché indici CONSECUTIVI saltino la ruota dei colori
// (libri vicini = colori chiaramente diversi). Assegnazione DETERMINISTICA per
// libro (ordinati per id → indice % palette). Il colore identifica il LIBRO;
// la piattaforma si legge dalla forma del glifo.
const BOOK_PALETTE = [
  "#f87171", // red-400
  "#38bdf8", // sky-400
  "#a3e635", // lime-400
  "#c084fc", // purple-400
  "#fb923c", // orange-400
  "#2dd4bf", // teal-400
  "#f472b6", // pink-400
  "#facc15", // yellow-400
  "#818cf8", // indigo-400
  "#4ade80", // green-400
  "#fb7185", // rose-400
  "#22d3ee", // cyan-400
] as const;

// Post senza libro associato → neutro slate-400.
const NEUTRAL_COLOR = "#94a3b8";

// Glifo social sempre bianco-ghiaccio: la piattaforma si distingue dalla FORMA,
// il libro dal COLORE della pill (mai colorare il glifo col colore-libro).
const GLYPH_COLOR = "#F8FAFC";

const DAY_MS = 24 * 60 * 60 * 1000;

// Max marker mostrati per giorno nella vista mensile; oltre → chip "+N".
const MONTH_MARKERS_LIMIT = 3;

// Curva e durata di motion condivise (= token tailwind `out-strong`).
const POPOVER_MS = 180;

// Tinta di sfondo della pill: colore-libro a ~14% opacità (#RRGGBB + alpha hex).
function tint(hex: string, alphaHex = "24"): string {
  return `${hex}${alphaHex}`;
}

// Lunedì come primo giorno della settimana (locale IT).
function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (date.getDay() + 6) % 7; // 0 = lunedì
  date.setDate(date.getDate() - dow);
  return date;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

function platformIcon(platform: ScheduledPost["platform"]) {
  return platform === "instagram" ? Instagram : Facebook;
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

interface CalendarPost {
  post: ScheduledPost;
  date: Date;
  color: string;
  bookTitle: string | null;
}

// ─── Marker / pill ────────────────────────────────────────────────────────────
//
// Forma = piattaforma (glifo FB/IG), colore = libro. Sfondo = colore-libro ~14%,
// bordo 1px pieno colore-libro, glifo bianco-ghiaccio per contrasto AA.

function MarkerPill({
  item,
  dimmed,
  size = "sm",
  withTime = false,
  block = false,
  onActivate,
}: {
  item: CalendarPost;
  dimmed: boolean;
  size?: "sm" | "wk";
  withTime?: boolean;
  block?: boolean;
  onActivate?: () => void;
}) {
  const Icon = platformIcon(item.post.platform);
  const interactive = !!onActivate;
  const glyph = size === "wk" ? "h-3 w-3" : "h-[0.8125rem] w-[0.8125rem]";
  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate?.();
              }
            }
          : undefined
      }
      title={withTime ? undefined : timeLabel(item.date)}
      className={cn(
        "items-center gap-1 border tabular-nums leading-none transition-[transform,opacity] duration-150 ease-out-strong",
        block ? "flex w-full" : "inline-flex shrink-0",
        size === "wk" ? "rounded-lg px-1.5 py-1 text-2xs font-medium" : "rounded-full p-1",
        // L'hover-scale solo su dispositivi con hover reale (Tailwind gata `hover:` dietro
        // @media(hover:hover)); sulle pill a tutta larghezza resta solo l'opacità per non
        // far traboccare il transform dalla colonna.
        !block && "hover:scale-[1.08]",
        interactive &&
          "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
        dimmed ? "opacity-25" : "opacity-100",
      )}
      style={{
        backgroundColor: tint(item.color),
        borderColor: item.color,
        color: GLYPH_COLOR,
      }}
    >
      <Icon className={cn(glyph, "shrink-0")} style={{ color: GLYPH_COLOR }} />
      {withTime && <span style={{ color: GLYPH_COLOR }}>{timeLabel(item.date)}</span>}
    </span>
  );
}

function NavButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-inset text-content-tertiary",
        "transition-[transform,color,border-color] duration-150 ease-out-strong hover:border-border hover:text-content-primary",
        "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
      )}
    >
      {children}
    </button>
  );
}

// ─── Popover "+N" (portal, position fixed, mai clippato) ──────────────────────

interface DayPopover {
  anchor: DOMRect;
  posts: CalendarPost[];
  dayLabel: string;
}

function MorePopover({
  data,
  selectedBookId,
  onClose,
}: {
  data: DayPopover;
  selectedBookId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Posiziona sotto il trigger; ribalta sopra se non c'è spazio. Clamp ai bordi.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 6;
    let top = data.anchor.bottom + gap;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, data.anchor.top - gap - height);
    }
    let left = data.anchor.left + data.anchor.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top, left });
  }, [data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={data.dayLabel}
      className="fixed z-50 w-60 origin-top rounded-xl border border-border-subtle bg-bg-raised p-3 shadow-popover animate-scale-in"
      style={{
        top: pos?.top ?? data.anchor.bottom + 6,
        left: pos?.left ?? data.anchor.left,
        visibility: pos ? "visible" : "hidden",
        animationDuration: `${POPOVER_MS}ms`,
      }}
    >
      <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-content-tertiary">
        {data.dayLabel}
      </p>
      <ul className="flex flex-col gap-1.5">
        {data.posts.map((it) => {
          const Icon = platformIcon(it.post.platform);
          const dimmed = !!selectedBookId && it.post.bookId !== selectedBookId;
          return (
            <li
              key={it.post.id}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-bg-inset px-2 py-1.5 transition-opacity",
                dimmed && "opacity-25",
              )}
            >
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                style={{ backgroundColor: tint(it.color), borderColor: it.color }}
              >
                <Icon className="h-3 w-3" style={{ color: GLYPH_COLOR }} />
              </span>
              <span className="shrink-0 text-2xs font-medium tabular-nums text-content-secondary">
                {timeLabel(it.date)}
              </span>
              <span className="truncate text-xs text-content-secondary">
                {it.bookTitle ?? t("dashboard.calendar.noBook")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}

// ─── Vista mensile (~40%) ─────────────────────────────────────────────────────

function MonthView({
  items,
  selectedBookId,
}: {
  items: CalendarPost[];
  selectedBookId: string | null;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [popover, setPopover] = useState<DayPopover | null>(null);

  const weekdayLabels = t("dashboard.calendar.weekdaysShort", {
    returnObjects: true,
  }) as string[];

  // Griglia di 6 settimane che coprono il mese (lunedì → domenica).
  const cells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor));
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(gridStart.getTime() + i * DAY_MS));
    }
    return days;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  function shift(delta: number) {
    setPopover(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const isDimmed = useCallback(
    (it: CalendarPost) => !!selectedBookId && it.post.bookId !== selectedBookId,
    [selectedBookId],
  );

  return (
    <div className="flex min-w-0 basis-2/5 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold capitalize text-content-primary">{monthLabel}</h4>
        <div className="flex items-center gap-1.5">
          <NavButton onClick={() => shift(-1)} ariaLabel={t("dashboard.calendar.prevMonth")}>
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <NavButton onClick={() => shift(1)} ariaLabel={t("dashboard.calendar.nextMonth")}>
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-2xs font-medium uppercase tracking-wide text-content-tertiary"
          >
            {label}
          </div>
        ))}

        {cells.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayPosts = items.filter((it) => sameDay(it.date, day));
          const shown = dayPosts.slice(0, MONTH_MARKERS_LIMIT);
          const extra = dayPosts.length - shown.length;
          const today = isToday(day);
          return (
            <div
              key={day.getTime()}
              className={cn(
                "flex min-h-[3.25rem] flex-col gap-1 rounded-xl border p-1.5",
                inMonth
                  ? "border-border-subtle bg-bg-inset"
                  : "border-transparent bg-transparent opacity-40",
                today && "ring-1 ring-accent-ring",
              )}
            >
              <span
                className={cn(
                  "text-2xs font-semibold tabular-nums",
                  today ? "text-accent-light" : "text-content-tertiary",
                )}
              >
                {day.getDate()}
              </span>
              {dayPosts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {shown.map((it) => (
                    <MarkerPill key={it.post.id} item={it} dimmed={isDimmed(it)} />
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      onClick={(e) =>
                        setPopover({
                          anchor: e.currentTarget.getBoundingClientRect(),
                          posts: dayPosts,
                          dayLabel: day.toLocaleDateString("it-IT", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          }),
                        })
                      }
                      className={cn(
                        "inline-flex h-[1.375rem] items-center rounded-full border border-border-subtle bg-bg-raised px-1.5 text-2xs font-semibold tabular-nums text-content-secondary",
                        "transition-[transform,color,border-color] duration-150 ease-out-strong hover:border-border hover:text-content-primary",
                        "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                      )}
                      aria-label={t("dashboard.calendar.morePosts", { count: extra })}
                    >
                      +{extra}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {popover && (
        <MorePopover
          data={popover}
          selectedBookId={selectedBookId}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

// ─── Vista settimanale (~60%) ─────────────────────────────────────────────────

function WeekView({
  items,
  selectedBookId,
}: {
  items: CalendarPost[];
  selectedBookId: string | null;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));

  const weekdayLabels = t("dashboard.calendar.weekdaysShort", {
    returnObjects: true,
  }) as string[];

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(new Date(cursor.getTime() + i * DAY_MS));
    return out;
  }, [cursor]);

  // Post per ciascun giorno della settimana, ORDINATI per ora crescente.
  const postsByDay = useMemo(
    () =>
      days.map((day) =>
        items
          .filter((it) => sameDay(it.date, day))
          .sort((a, b) => a.date.getTime() - b.date.getTime()),
      ),
    [days, items],
  );

  const rangeLabel = `${days[0].toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  })} – ${days[6].toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}`;

  function shift(deltaWeeks: number) {
    setCursor((c) => new Date(c.getTime() + deltaWeeks * 7 * DAY_MS));
  }

  return (
    <div className="flex min-w-0 basis-3/5 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-content-primary">{rangeLabel}</h4>
        <div className="flex items-center gap-1.5">
          <NavButton onClick={() => shift(-1)} ariaLabel={t("dashboard.calendar.prevWeek")}>
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <NavButton onClick={() => shift(1)} ariaLabel={t("dashboard.calendar.nextWeek")}>
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
      </div>

      {/* Colonne "per slot reali": 7 giorni, ognuno alto quanto il suo
          contenuto, allineati in alto. Mostra una fascia oraria solo dove c'è
          un post; i giorni vuoti restano corti con un placeholder discreto. */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[30rem] grid-cols-7 items-start gap-1">
          {days.map((day, i) => {
            const dayPosts = postsByDay[i];
            const today = isToday(day);
            return (
              <div key={day.getTime()} className="flex min-w-0 flex-col gap-1">
                {/* Header colonna: giorno + numero, oggi con ring sottile. */}
                <div
                  className={cn(
                    "flex flex-col items-center rounded-lg py-1 text-2xs",
                    today
                      ? "text-accent-light ring-1 ring-inset ring-accent-ring"
                      : "text-content-tertiary",
                  )}
                >
                  <span className="font-medium uppercase tracking-wide">{weekdayLabels[i]}</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      today ? "text-accent-light" : "text-content-secondary",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Elenco verticale dei soli post programmati, ora crescente. */}
                {dayPosts.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {dayPosts.map((it) => (
                      <MarkerPill
                        key={it.post.id}
                        item={it}
                        size="wk"
                        withTime
                        block
                        dimmed={!!selectedBookId && it.post.bookId !== selectedBookId}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex justify-center pt-0.5 text-2xs leading-none text-content-faint"
                  >
                    –
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Legenda / filtro libro (con doppia codifica per daltonismo) ──────────────

function bookInitials(title: string): string {
  return title.trim().slice(0, 2).toUpperCase() || "··";
}

function Legend({
  books,
  usedBookIds,
  colorOf,
  selectedBookId,
  onSelect,
}: {
  books: Book[];
  usedBookIds: Set<string>;
  colorOf: (bookId: string) => string;
  selectedBookId: string | null;
  onSelect: (bookId: string | null) => void;
}) {
  const { t } = useTranslation();
  const used = books.filter((b) => usedBookIds.has(b.id));
  if (used.length === 0) return null;
  return (
    <div className="border-t border-border-subtle pt-4">
      <h4 className="mb-2 text-2xs font-medium uppercase tracking-wide text-content-tertiary">
        {t("dashboard.calendar.legend")}
      </h4>
      <div className="flex flex-wrap gap-2">
        {used.map((b) => {
          const color = colorOf(b.id);
          const active = selectedBookId === b.id;
          const muted = !!selectedBookId && !active;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : b.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border bg-bg-inset py-1 pl-1 pr-2.5 text-xs",
                "transition-[transform,color,border-color,opacity] duration-150 ease-out-strong",
                "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
                active
                  ? "border-border-strong text-content-primary"
                  : "border-border-subtle text-content-secondary hover:border-border",
                muted && "opacity-40",
              )}
            >
              {/* Swatch con le PRIME 2 LETTERE: il colore non è l'unico segnale. */}
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[0.625rem] font-bold leading-none tabular-nums"
                style={{
                  backgroundColor: tint(color),
                  borderColor: color,
                  color: GLYPH_COLOR,
                }}
              >
                {bookInitials(b.title)}
              </span>
              <span className="max-w-[12rem] truncate">{b.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principale ──────────────────────────────────────────────────

export function DashboardCalendar() {
  const { t } = useTranslation();
  const postsState = useAsync<ScheduledPost[]>((s) => getScheduledPosts(s), []);
  const booksState = useAsync<Book[]>((s) => getBooks(s), []);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  const books = booksState.data ?? [];
  const posts = postsState.data ?? [];

  // Mappa bookId → colore: libri ordinati per id, indice % palette (deterministico).
  const colorMap = useMemo(() => {
    const sorted = [...books].sort((a, b) => a.id.localeCompare(b.id));
    const map = new Map<string, string>();
    sorted.forEach((b, i) => map.set(b.id, BOOK_PALETTE[i % BOOK_PALETTE.length]));
    return map;
  }, [books]);

  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of books) map.set(b.id, b.title);
    return map;
  }, [books]);

  const bookColor = useCallback(
    (bookId: string | null | undefined): string =>
      (bookId && colorMap.get(bookId)) || NEUTRAL_COLOR,
    [colorMap],
  );

  // Post programmati con data valida, arricchiti di Date, colore e titolo libro.
  const items = useMemo<CalendarPost[]>(() => {
    return posts
      .filter((p) => typeof p.scheduledAt === "number" && p.scheduledAt! > 0)
      .map((p) => ({
        post: p,
        date: new Date(p.scheduledAt as number),
        color: bookColor(p.bookId),
        bookTitle: (p.bookId && titleMap.get(p.bookId)) || null,
      }));
  }, [posts, bookColor, titleMap]);

  const usedBookIds = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.post.bookId) set.add(it.post.bookId);
    return set;
  }, [items]);

  // Se il libro filtrato non ha più post (cambio dati), azzera il filtro.
  useEffect(() => {
    if (selectedBookId && !usedBookIds.has(selectedBookId)) setSelectedBookId(null);
  }, [selectedBookId, usedBookIds]);

  const loading = postsState.loading || booksState.loading;
  const error = postsState.error || booksState.error;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-accent-light" />
            {t("dashboard.calendar.title")}
          </span>
        }
        description={t("dashboard.calendar.description")}
      />
      <CardBody>
        {loading ? (
          <div className="flex flex-col gap-6 lg:flex-row">
            <Skeleton className="h-64 basis-2/5" />
            <Skeleton className="h-64 basis-3/5" />
          </div>
        ) : error ? (
          <ErrorBanner
            message={error}
            onRetry={() => {
              postsState.reload();
              booksState.reload();
            }}
          />
        ) : items.length === 0 ? (
          <p className="text-sm text-content-tertiary">{t("dashboard.calendar.noScheduled")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              <MonthView items={items} selectedBookId={selectedBookId} />
              <WeekView items={items} selectedBookId={selectedBookId} />
            </div>
            <Legend
              books={books}
              usedBookIds={usedBookIds}
              colorOf={bookColor}
              selectedBookId={selectedBookId}
              onSelect={setSelectedBookId}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
