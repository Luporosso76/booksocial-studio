import type { ContentType, PostingSlot } from "../domain.js";

// SCHEDULER della settimana: dato il NUMERO di pubblicazioni volute (quote) e le FINESTRE
// orarie permesse, decide AUTOMATICAMENTE su quali date+ore reali mettere ogni contenuto,
// con una valutazione concreta:
//  - pesa giorni/orari per best-practice (vedi DAY_WEIGHT/hourWeight, fonti social 2026);
//  - distribuisce i contenuti "principali" (post/reel) su giorni diversi, ben spaziati,
//    UNO al giorno (poi 2 solo se le quote superano i giorni disponibili);
//  - le STORIE possono cadere lo stesso giorno di un principale ma a un ORARIO DIVERSO,
//    e vengono distanziate nella giornata (effimere → alta frequenza);
//  - sceglie un minuto VARIATO dentro la fascia, mai un orario passato, niente collisioni.
// Nessun I/O: pura logica, testabile. Il WeekPlanner la nutre con dati dal DB.

export interface TimeWindow {
  dayOfWeek: number; // 1=Lun .. 7=Dom (ISO)
  startMin: number; // minuti dalla mezzanotte
  endMin: number;
}

export interface ScheduledItem {
  when: Date;
  type: ContentType;
}

export interface ScheduleOpts {
  from: Date; // inizio dell'orizzonte (di norma "adesso", o la data scelta)
  quotas: { posts: number; reels: number; stories: number };
  windows: TimeWindow[]; // finestre permesse (da PostingSlot o default)
  horizonDays?: number; // quanti giorni coprire a partire da `from` (default 7 = settimana)
  takenKeys?: Set<string>; // "YYYY-MM-DD-HH:MM" già occupati (post esistenti) da evitare
  rng?: () => number;
}

// Peso per giorno della settimana (best-practice Facebook: mar-gio i migliori).
const DAY_WEIGHT: Record<number, number> = {
  1: 0.7,
  2: 1.0,
  3: 1.0,
  4: 1.0,
  5: 0.8,
  6: 0.7,
  7: 0.6,
};

// Peso per ora del giorno: picchi 12-15 e 18-20, mattina 9-11 discreta.
function hourWeight(hour: number): number {
  if (hour >= 12 && hour <= 15) return 1.0;
  if (hour >= 18 && hour <= 20) return 1.0;
  if (hour >= 16 && hour <= 17) return 0.85;
  if (hour >= 9 && hour <= 11) return 0.7;
  if (hour === 21) return 0.6;
  if (hour >= 7 && hour <= 8) return 0.5;
  return 0.25;
}

// Finestre di DEFAULT (best-practice) usate quando la pagina non ne ha definite: ogni
// giorno una fascia mattutina (9-11) e una serale (18-21), così principali (sera) e
// storie (mattina/sera) hanno orari diversi su cui distribuirsi.
export function defaultWindows(): TimeWindow[] {
  const w: TimeWindow[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    w.push({ dayOfWeek: dow, startMin: 9 * 60, endMin: 11 * 60 });
    w.push({ dayOfWeek: dow, startMin: 18 * 60, endMin: 21 * 60 });
  }
  return w;
}

// Converte gli slot della pagina in finestre. Slot con fascia → [start,end]; slot con
// solo orario singolo → fascia stretta di ±30 min attorno a quell'ora.
export function slotsToWindows(slots: PostingSlot[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const s of slots) {
    if (!s.enabled) continue;
    const start = parseHHmm(s.timeStart);
    const end = parseHHmm(s.timeEnd);
    if (start != null && end != null) {
      const a = start[0] * 60 + start[1];
      const b = end[0] * 60 + end[1];
      out.push({ dayOfWeek: s.dayOfWeek, startMin: Math.min(a, b), endMin: Math.max(a, b) });
    } else {
      const t = parseHHmm(s.timeOfDay);
      if (t != null) {
        const m = t[0] * 60 + t[1];
        out.push({
          dayOfWeek: s.dayOfWeek,
          startMin: Math.max(0, m - 30),
          endMin: Math.min(1439, m + 30),
        });
      }
    }
  }
  return out;
}

function parseHHmm(s: string | null | undefined): [number, number] | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59)
    return null;
  return [hh, mm];
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function minuteKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dateKey(d)}-${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface DayInfo {
  date: Date; // mezzanotte locale del giorno
  dow: number;
  weight: number; // peso giorno
  windows: TimeWindow[];
}

// Sceglie un minuto dentro una finestra di un giorno, dopo `from`, con bias opzionale
// verso la parte tarda della fascia (per i principali, che rendono di sera). Riprova per
// evitare collisioni con `taken`. Ritorna una Date o null se la finestra è già passata.
function pickWithinWindow(
  day: DayInfo,
  w: TimeWindow,
  from: Date,
  taken: Set<string>,
  rng: () => number,
  lateBias: boolean,
  avoidMin?: number, // minuto-del-giorno da cui stare lontani (storie vs principale)
): Date | null {
  let lo = w.startMin;
  const hi = w.endMin;
  // Non prima di `from` (con 5 minuti di margine) se è lo stesso giorno.
  if (dateKey(day.date) === dateKey(from)) {
    const fromMin = from.getHours() * 60 + from.getMinutes() + 5;
    lo = Math.max(lo, fromMin);
  }
  if (lo > hi) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    let chosen: number;
    if (lateBias) {
      const a = lo + Math.floor(rng() * (hi - lo + 1));
      const b = lo + Math.floor(rng() * (hi - lo + 1));
      chosen = Math.max(a, b);
    } else {
      chosen = lo + Math.floor(rng() * (hi - lo + 1));
    }
    if (avoidMin != null && Math.abs(chosen - avoidMin) < 90) continue; // ≥90 min dal principale
    const when = new Date(day.date);
    when.setHours(0, chosen, 0, 0);
    if (when.getTime() < from.getTime()) continue;
    if (taken.has(minuteKey(when))) continue;
    taken.add(minuteKey(when));
    return when;
  }
  return null;
}

// Finestra "migliore" di un giorno per un contenuto principale (peso ora più alto).
function bestWindow(day: DayInfo): TimeWindow | null {
  let best: TimeWindow | null = null;
  let bestW = -1;
  for (const w of day.windows) {
    const midHour = Math.floor((w.startMin + w.endMin) / 2 / 60);
    const ww = hourWeight(midHour);
    if (ww > bestW) {
      bestW = ww;
      best = w;
    }
  }
  return best;
}

export function buildSchedule(opts: ScheduleOpts): ScheduledItem[] {
  const rng = opts.rng ?? Math.random;
  const taken = new Set<string>(opts.takenKeys ?? []);

  // Giorni dell'orizzonte a partire da `from` (default 7 = settimana), con finestre e peso.
  const horizon = Math.max(1, Math.floor(opts.horizonDays ?? 7));
  const days: DayInfo[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(opts.from);
    d.setDate(opts.from.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const windows = opts.windows.filter((w) => w.dayOfWeek === dow);
    if (windows.length === 0) continue; // giorno senza finestre → non pubblicabile
    days.push({ date: d, dow, weight: DAY_WEIGHT[dow] ?? 0.7, windows });
  }
  if (days.length === 0) return [];

  const items: ScheduledItem[] = [];
  const mainMinuteByDay = new Map<string, number>(); // dateKey → minuto del principale (per distanziare le storie)

  // ---- PRINCIPALI (post + reel): uno al giorno, sui giorni migliori, ben spaziati. ----
  const mainTypes: ContentType[] = [
    ...Array<ContentType>(Math.max(0, opts.quotas.posts)).fill("post"),
    ...Array<ContentType>(Math.max(0, opts.quotas.reels)).fill("reel"),
  ];
  // Mescola tipi (interleave) così reel e post si alternano nella settimana.
  for (let i = mainTypes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mainTypes[i], mainTypes[j]] = [mainTypes[j]!, mainTypes[i]!];
  }

  // Ordina i giorni per peso (migliori prima) per la selezione, ma poi assegna in ordine
  // cronologico così la spaziatura resta naturale. Round 1: un principale per giorno sui
  // giorni migliori; round successivi (se quote > giorni) aggiungono un secondo al giorno.
  const byWeight = [...days].sort((a, b) => b.weight - a.weight || rng() - 0.5);
  const chosenMain: { day: DayInfo; type: ContentType }[] = [];
  let mi = 0;
  let round = 0;
  while (mi < mainTypes.length && round < 3) {
    for (const day of byWeight) {
      if (mi >= mainTypes.length) break;
      const used = chosenMain.filter((c) => dateKey(c.day.date) === dateKey(day.date)).length;
      if (used > round) continue; // round 0 = max 1/giorno, round 1 = max 2/giorno, ecc.
      chosenMain.push({ day, type: mainTypes[mi]! });
      mi++;
    }
    round++;
  }
  // Assegna gli orari ai principali (bias serale) in ordine cronologico.
  chosenMain.sort((a, b) => a.day.date.getTime() - b.day.date.getTime());
  for (const { day, type } of chosenMain) {
    const w = bestWindow(day);
    if (!w) continue;
    const when = pickWithinWindow(day, w, opts.from, taken, rng, true);
    if (!when) continue;
    items.push({ when, type });
    mainMinuteByDay.set(dateKey(day.date), when.getHours() * 60 + when.getMinutes());
  }

  // ---- STORIE: distribuite sui giorni (anche gli stessi dei principali) a orari diversi. ----
  const storyCount = Math.max(0, opts.quotas.stories);
  // Round-robin sui giorni partendo dai migliori; alterna bias mattina/sera per spaziare.
  let placed = 0;
  let guard = 0;
  while (placed < storyCount && guard < storyCount * days.length + days.length) {
    for (const day of byWeight) {
      if (placed >= storyCount) break;
      const avoid = mainMinuteByDay.get(dateKey(day.date));
      // Prova TUTTE le finestre del giorno (partendo da una diversa ogni volta per
      // distanziare/alternare mattina-sera): così se una è passata o piena si ripiega
      // sulle altre invece di sprecare il giro.
      let when: Date | null = null;
      for (let k = 0; k < day.windows.length && !when; k++) {
        const w = day.windows[(placed + k) % day.windows.length]!;
        when = pickWithinWindow(day, w, opts.from, taken, rng, false, avoid);
      }
      if (when) {
        items.push({ when, type: "story" });
        placed++;
      }
    }
    guard++;
  }

  items.sort((a, b) => a.when.getTime() - b.when.getTime());
  return items;
}
