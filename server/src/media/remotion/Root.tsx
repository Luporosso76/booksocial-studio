import React from "react";
import { Composition } from "remotion";
import { Reel, reelDurationInFrames } from "./Reel";

// Root Remotion: registra la composizione "Reel" 9:16. La durata viene calcolata
// dalle scene passate via inputProps al momento del render (calculateMetadata).

const defaultProps = {
  scenes: [{ quote: "Citazione di esempio.", anim: "fade", sec: 3 }],
  palette: "ink",
  accent: "#c8553d",
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const scenes = Array.isArray((props as { scenes?: unknown }).scenes)
          ? (props as { scenes: { sec?: number }[] }).scenes
          : defaultProps.scenes;
        return { durationInFrames: reelDurationInFrames(scenes) };
      }}
    />
  );
};
