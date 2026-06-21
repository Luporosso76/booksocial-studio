import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageCircle,
  Cloud,
  Zap,
  Square,
  Upload,
  Download,
  Trash2,
  Plus,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea, selectClass } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast";

// Editor interattivo di FUMETTI/balloon, 100% lato browser: l'immagine sorgente (generata o caricata)
// fa da sfondo; sopra si aggiungono balloon trascinabili/ridimensionabili con stili diversi (discorso
// con coda, pensiero, urlo, didascalia). L'esportazione ridisegna tutto su <canvas> alla risoluzione
// nativa → PNG scaricabile. Coordinate dei balloon in PIXEL NATIVI dell'immagine (così editor ed
// export coincidono); l'SVG di overlay usa viewBox=0 0 W H e scala da solo alla dimensione mostrata.

type BType = "speech" | "thought" | "shout" | "caption";

interface Balloon {
  id: string;
  type: BType;
  text: string;
  x: number; // top-left del corpo (px nativi)
  y: number;
  w: number;
  h: number;
  tx: number; // punta della coda (px nativi) — usata da speech/thought
  ty: number;
  font: number; // px nativi
}

const FONT_FAMILY = 'system-ui, "Segoe UI", Arial, sans-serif';

// Canvas di misura condiviso per spezzare il testo in righe (stesso calcolo per editor ed export).
let measureCtx: CanvasRenderingContext2D | null = null;
function wrapText(text: string, maxWidth: number, fontPx: number): string[] {
  if (!measureCtx) {
    const cv = document.createElement("canvas");
    measureCtx = cv.getContext("2d");
  }
  const ctx = measureCtx;
  const clean = text.replace(/\s+/g, " ").trim();
  if (ctx) ctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const width = ctx ? ctx.measureText(test).width : test.length * fontPx * 0.5;
    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// ---- generatori di path (stringa "d"): usati sia in <path> SVG sia in new Path2D() per il canvas ----
function roundedRectD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rr},${y} h${w - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - 2 * rr)} a${rr},${rr} 0 0 1 ${-rr},${-rr} v${-(h - 2 * rr)} a${rr},${rr} 0 0 1 ${rr},${-rr} z`;
}
function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${2 * rx},0 a${rx},${ry} 0 1 0 ${-2 * rx},0 z`;
}
function starD(cx: number, cy: number, rx: number, ry: number, points = 12): string {
  let d = "";
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const ang = (Math.PI * i) / points - Math.PI / 2;
    const out = i % 2 === 0;
    const px = cx + Math.cos(ang) * rx * (out ? 1 : 0.74);
    const py = cy + Math.sin(ang) * ry * (out ? 1 : 0.74);
    d += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)} `;
  }
  return d + "z";
}
function bubbleD(b: Balloon): string {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (b.type === "thought") return ellipseD(cx, cy, b.w / 2, b.h / 2);
  if (b.type === "shout") return starD(cx, cy, b.w / 2, b.h / 2);
  const r = b.type === "caption" ? Math.min(b.w, b.h) * 0.08 : Math.min(b.w, b.h) * 0.22;
  return roundedRectD(b.x, b.y, b.w, b.h, r);
}
// Coda del balloon "speech": triangolo dalla base (bordo inferiore) alla punta (tx,ty).
function speechTailD(b: Balloon): string {
  const cx = b.x + b.w / 2;
  const baseY = b.y + b.h - 2;
  const half = Math.max(8, b.w * 0.09);
  return `M${cx - half},${baseY} L${b.tx},${b.ty} L${cx + half},${baseY} z`;
}
// Coda del balloon "thought": cerchietti decrescenti dalla base verso la punta.
function thoughtDots(b: Balloon): { cx: number; cy: number; r: number }[] {
  const sx = b.x + b.w / 2;
  const sy = b.y + b.h;
  const dots: { cx: number; cy: number; r: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    dots.push({
      cx: sx + (b.tx - sx) * t,
      cy: sy + (b.ty - sy) * t,
      r: Math.max(3, b.w * 0.05 * (1 - t * 0.5)),
    });
  }
  return dots;
}

const NEW_TYPES: { type: BType; labelKey: string; icon: typeof MessageCircle }[] = [
  { type: "speech", labelKey: "balloon.typeSpeech", icon: MessageCircle },
  { type: "thought", labelKey: "balloon.typeThought", icon: Cloud },
  { type: "shout", labelKey: "balloon.typeShout", icon: Zap },
  { type: "caption", labelKey: "balloon.typeCaption", icon: Square },
];

// Persistenza editor (sopravvive al cambio pagina): immagine sorgente + balloon in localStorage.
const EKEY_SRC = "booksocial.balloonEditor.src";
const EKEY_BALLOONS = "booksocial.balloonEditor.balloons";
function loadEditorSrc(): string | null {
  try {
    return localStorage.getItem(EKEY_SRC);
  } catch {
    return null;
  }
}
function loadEditorBalloons(): Balloon[] {
  try {
    const r = localStorage.getItem(EKEY_BALLOONS);
    return r ? (JSON.parse(r) as Balloon[]) : [];
  } catch {
    return [];
  }
}

export function BalloonEditor({ src }: { src?: string | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [displaySrc, setDisplaySrc] = useState<string | null>(() => src ?? loadEditorSrc());
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // Ripristina i balloon SOLO se appartengono all'immagine corrente (stessa sorgente persistita).
  const [balloons, setBalloons] = useState<Balloon[]>(() => {
    const persisted = loadEditorSrc();
    const effective = src ?? persisted;
    return effective && effective === persisted ? loadEditorBalloons() : [];
  });
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<null | {
    id: string;
    mode: "move" | "resize" | "tail";
    sx: number;
    sy: number;
    orig: Balloon;
  }>(null);

  // Carica l'immagine passata dal generatore SOLO se è nuova (diversa da quella corrente): così,
  // al rientro nella pagina con la stessa immagine, NON azzera i balloon ripristinati.
  useEffect(() => {
    if (src && src !== displaySrc) {
      setDisplaySrc(src);
      setBalloons([]);
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Persistenza: salva sorgente (raro) e balloon (a ogni modifica, JSON piccolo).
  useEffect(() => {
    try {
      if (displaySrc) localStorage.setItem(EKEY_SRC, displaySrc);
      else localStorage.removeItem(EKEY_SRC);
    } catch {
      /* quota/Storage non disponibile: best-effort */
    }
  }, [displaySrc]);
  useEffect(() => {
    try {
      localStorage.setItem(EKEY_BALLOONS, JSON.stringify(balloons));
    } catch {
      /* quota: best-effort */
    }
  }, [balloons]);

  // Drag globale: converte i px schermo in px nativi via la scala dell'SVG.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      const svg = svgRef.current;
      if (!d || !svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const sc = (dims?.w ?? rect.width) / rect.width;
      const dx = (e.clientX - d.sx) * sc;
      const dy = (e.clientY - d.sy) * sc;
      setBalloons((bs) =>
        bs.map((b) => {
          if (b.id !== d.id) return b;
          if (d.mode === "move")
            return {
              ...b,
              x: d.orig.x + dx,
              y: d.orig.y + dy,
              tx: d.orig.tx + dx,
              ty: d.orig.ty + dy,
            };
          if (d.mode === "resize")
            return { ...b, w: Math.max(60, d.orig.w + dx), h: Math.max(40, d.orig.h + dy) };
          return { ...b, tx: d.orig.tx + dx, ty: d.orig.ty + dy };
        }),
      );
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dims]);

  function startDrag(e: React.PointerEvent, b: Balloon, mode: "move" | "resize" | "tail") {
    e.stopPropagation();
    setSelected(b.id);
    dragRef.current = { id: b.id, mode, sx: e.clientX, sy: e.clientY, orig: { ...b } };
  }

  function addBalloon(type: BType) {
    if (!dims) return;
    const w = dims.w * 0.4;
    const h = dims.h * 0.16;
    const x = dims.w / 2 - w / 2;
    const y = dims.h * 0.08;
    const b: Balloon = {
      id: Math.random().toString(36).slice(2),
      type,
      text: type === "caption" ? t("balloon.captionDefault") : t("balloon.textDefault"),
      x,
      y,
      w,
      h,
      tx: x + w / 2,
      ty: y + h + dims.h * 0.12,
      font: Math.max(16, dims.w * 0.03),
    };
    setBalloons((bs) => [...bs, b]);
    setSelected(b.id);
  }

  function updateSel(patch: Partial<Balloon>) {
    if (!selected) return;
    setBalloons((bs) => bs.map((b) => (b.id === selected ? { ...b, ...patch } : b)));
  }
  function removeSel() {
    if (!selected) return;
    setBalloons((bs) => bs.filter((b) => b.id !== selected));
    setSelected(null);
  }

  function onUpload(file: File | null | undefined) {
    if (!file) return;
    // dataURL (non object URL): sopravvive al cambio pagina ed è usabile sia in <img> sia nel canvas.
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setDisplaySrc(reader.result);
      setBalloons([]);
      setSelected(null);
    };
    reader.readAsDataURL(file);
  }

  function exportPng() {
    const img = imgRef.current;
    if (!img || !dims) return;
    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, dims.w, dims.h);
    ctx.lineJoin = "round";
    for (const b of balloons) {
      // coda dietro al corpo
      if (b.type === "speech") {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = Math.max(2, b.w * 0.012);
        const tail = new Path2D(speechTailD(b));
        ctx.fill(tail);
        ctx.stroke(tail);
      } else if (b.type === "thought") {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = Math.max(2, b.w * 0.01);
        for (const dot of thoughtDots(b)) {
          ctx.beginPath();
          ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      // corpo
      const body = new Path2D(bubbleD(b));
      ctx.fillStyle = b.type === "caption" ? "#fdf6e3" : "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = Math.max(2, b.w * 0.014);
      ctx.fill(body);
      ctx.stroke(body);
      // testo
      ctx.fillStyle = "#111111";
      ctx.font = `600 ${b.font}px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pad = b.w * 0.12;
      const lines = wrapText(b.text, b.w - pad * 2, b.font);
      const lh = b.font * 1.22;
      const startY = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, b.x + b.w / 2, startY + i * lh));
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error(t("balloon.exportFailed"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fumetto.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const sel = balloons.find((b) => b.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onUpload(e.target.files?.[0])}
        />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" />
          Carica immagine
        </Button>
        <span className="mx-1 h-5 w-px bg-border-subtle" />
        {NEW_TYPES.map(({ type, labelKey, icon: Icon }) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            disabled={!dims}
            onClick={() => addBalloon(type)}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </Button>
        ))}
        <span className="flex-1" />
        <Button variant="primary" size="sm" disabled={!dims} onClick={exportPng}>
          <Download className="h-4 w-4" />
          Scarica PNG
        </Button>
      </div>

      {/* Canvas / area immagine + overlay SVG */}
      {displaySrc ? (
        <div className="relative inline-block max-w-full self-start overflow-hidden rounded-lg shadow-card">
          <img
            ref={imgRef}
            src={displaySrc}
            alt="base"
            className="block max-h-[70vh] w-auto max-w-full select-none"
            draggable={false}
            onLoad={() => {
              const im = imgRef.current;
              if (im) setDims({ w: im.naturalWidth, h: im.naturalHeight });
            }}
          />
          {dims && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              className="absolute inset-0 h-full w-full"
              onPointerDown={() => setSelected(null)}
            >
              {balloons.map((b) => {
                const isSel = b.id === selected;
                return (
                  <g key={b.id}>
                    {b.type === "speech" && (
                      <path
                        d={speechTailD(b)}
                        fill="#ffffff"
                        stroke="#111111"
                        strokeWidth={Math.max(2, b.w * 0.012)}
                      />
                    )}
                    {b.type === "thought" &&
                      thoughtDots(b).map((d, i) => (
                        <circle
                          key={i}
                          cx={d.cx}
                          cy={d.cy}
                          r={d.r}
                          fill="#ffffff"
                          stroke="#111111"
                          strokeWidth={Math.max(2, b.w * 0.01)}
                        />
                      ))}
                    <path
                      d={bubbleD(b)}
                      fill={b.type === "caption" ? "#fdf6e3" : "#ffffff"}
                      stroke={isSel ? "#c8553d" : "#111111"}
                      strokeWidth={Math.max(2, b.w * 0.014)}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => startDrag(e, b, "move")}
                    />
                    <text
                      x={b.x + b.w / 2}
                      y={b.y + b.h / 2}
                      fill="#111111"
                      fontFamily='system-ui, "Segoe UI", Arial, sans-serif'
                      fontWeight={600}
                      fontSize={b.font}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {(() => {
                        const lines = wrapText(b.text, b.w - b.w * 0.24, b.font);
                        const lh = b.font * 1.22;
                        const startY = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2;
                        return lines.map((ln, i) => (
                          <tspan key={i} x={b.x + b.w / 2} y={startY + i * lh}>
                            {ln}
                          </tspan>
                        ));
                      })()}
                    </text>
                    {isSel && (
                      <>
                        {/* maniglia ridimensiona (angolo basso-destra) */}
                        <rect
                          x={b.x + b.w - b.font * 0.7}
                          y={b.y + b.h - b.font * 0.7}
                          width={b.font * 1.4}
                          height={b.font * 1.4}
                          fill="#c8553d"
                          rx={4}
                          style={{ cursor: "nwse-resize" }}
                          onPointerDown={(e) => startDrag(e, b, "resize")}
                        />
                        {/* maniglia coda (solo discorso/pensiero) */}
                        {(b.type === "speech" || b.type === "thought") && (
                          <circle
                            cx={b.tx}
                            cy={b.ty}
                            r={b.font * 0.7}
                            fill="#c8553d"
                            style={{ cursor: "grab" }}
                            onPointerDown={(e) => startDrag(e, b, "tail")}
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-bg-inset px-4 py-10 text-sm text-content-tertiary">
          <Upload className="h-6 w-6" />
          Genera un'immagine sopra, oppure carica un'immagine per aggiungere i fumetti.
        </div>
      )}

      {/* Pannello del balloon selezionato */}
      {sel && (
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
              Balloon selezionato
            </span>
            <Button variant="ghost" size="sm" onClick={removeSel}>
              <Trash2 className="h-4 w-4" />
              Elimina
            </Button>
          </div>
          <Textarea
            value={sel.text}
            onChange={(e) => updateSel({ text: e.target.value })}
            rows={2}
            placeholder="Testo del balloon"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={sel.type}
              onChange={(e) => updateSel({ type: e.target.value as BType })}
            >
              {NEW_TYPES.map((nt) => (
                <option key={nt.type} value={nt.type}>
                  {t(nt.labelKey)}
                </option>
              ))}
            </select>
            <span className="ml-1 text-2xs text-content-faint">Testo</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateSel({ font: Math.max(10, sel.font - 2) })}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums text-content-secondary">
              {Math.round(sel.font)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => updateSel({ font: sel.font + 2 })}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-2xs text-content-faint">
            Trascina il balloon per spostarlo, il quadratino per ridimensionarlo, il pallino per la
            coda. Poi “Scarica PNG”.
          </p>
        </div>
      )}
    </div>
  );
}
