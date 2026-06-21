import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Composizione Remotion per un reel 9:16. Riceve via inputProps uno spec "reel_text"
// gia' validato (vedi server/src/media/spec.ts). Ogni scena ha testo/citazione REALE
// (mai inventata: arriva dal book_quote del libro) con animazione fade-up + lieve zoom.
//
// Questo file NON passa dal tsc del progetto (include: src/**/*.ts): viene compilato
// dal bundler di Remotion (esbuild) al momento del render. I tipi sono volutamente
// permissivi per non dipendere dalle dichiarazioni del server.

const FPS = 30;

type Scene = {
  text?: string;
  quote?: string;
  anim?: string;
  sec?: number;
  cta?: string;
  // Data URI di un'immagine reale del libro (risolta server-side in renderRemotion.ts).
  image?: string;
};

type ReelProps = {
  scenes?: Scene[];
  palette?: string;
  accent?: string;
};

const GRADIENTS: Record<string, [string, string, string]> = {
  ink: ["#1b1b26", "#2a2540", "#f5f3ee"],
  warm: ["#3a2417", "#7a3b1d", "#fdf3e7"],
  cool: ["#13313f", "#1f5a73", "#eaf4f8"],
  mono: ["#000000", "#222222", "#ffffff"],
  brand: ["#101418", "#243240", "#f6f7f9"],
};

function fontSizeFor(len: number): number {
  if (len > 200) return 60;
  if (len > 130) return 74;
  if (len > 70) return 88;
  return 104;
}

function sceneText(s: Scene): { text: string; isQuote: boolean } {
  const raw = (s.quote ?? s.text ?? "").trim();
  if (raw === "") return { text: "", isQuote: false };
  if (s.quote && !/^[«"“]/.test(raw)) return { text: `«${raw}»`, isQuote: true };
  return { text: raw, isQuote: !!s.quote };
}

const SceneCard: React.FC<{ scene: Scene; palette: string }> = ({ scene, palette }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [from, to, gradFg] = GRADIENTS[palette] ?? GRADIENTS.ink;
  const { text, isQuote } = sceneText(scene);
  const fs = fontSizeFor(text.length);
  const hasImage = typeof scene.image === "string" && scene.image.length > 0;
  const fg = hasImage ? "#ffffff" : gradFg;

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateY = interpolate(enter, [0, 1], [40, 0]);
  const scale = interpolate(enter, [0, 1], [0.96, 1]);

  // Ken Burns: lento zoom-in dell'immagine di sfondo sulla durata della scena.
  const kbScale = hasImage
    ? interpolate(frame, [0, Math.max(1, durationInFrames)], [1.0, 1.08], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill
      style={{
        background: hasImage ? "#0d0d12" : `linear-gradient(160deg, ${from}, ${to})`,
        alignItems: "center",
        justifyContent: "center",
        padding: "120px 90px",
        overflow: "hidden",
      }}
    >
      {hasImage ? (
        <AbsoluteFill>
          <img
            src={scene.image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${kbScale})`,
            }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(8,8,12,0.45) 0%, rgba(8,8,12,0.35) 45%, rgba(8,8,12,0.72) 100%)",
            }}
          />
        </AbsoluteFill>
      ) : null}
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            fontFamily: isQuote
              ? "Georgia, 'Times New Roman', serif"
              : "Arial, Helvetica, sans-serif",
            fontWeight: 700,
            fontSize: fs,
            lineHeight: 1.22,
            color: fg,
            textShadow: hasImage ? "0 2px 20px rgba(0,0,0,0.6)" : undefined,
          }}
        >
          {text}
        </div>
        {scene.cta ? (
          <div
            style={{
              marginTop: 56,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontWeight: 700,
              fontSize: 38,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: fg,
              opacity: 0.85,
            }}
          >
            {scene.cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = ({ scenes = [], palette = "ink" }) => {
  let acc = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.map((scene, i) => {
        const durationInFrames = Math.max(1, Math.round((scene.sec ?? 3) * FPS));
        const fromFrame = acc;
        acc += durationInFrames;
        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationInFrames}>
            <SceneCard scene={scene} palette={palette} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const reelDurationInFrames = (scenes: Scene[]): number =>
  Math.max(
    1,
    scenes.reduce((a, s) => a + Math.max(1, Math.round((s.sec ?? 3) * FPS)), 0),
  );
