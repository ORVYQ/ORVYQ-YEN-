import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

export type EmphasisCardSpec = {
  eyebrow: string;
  title: string;
  accent?: string | null;
  anchor_text?: string;
};

export const EmphasisCard: React.FC<{
  spec: EmphasisCardSpec;
  durationInFrames: number;
}> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - 16), durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(0.64, 0, 0.78, 0),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const opacity = enter * exit;
  const translateY = interpolate(enter, [0, 1], [30, 0]);
  const lineScale = interpolate(frame, [6, 28], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const accent = spec.accent || "#E06A63";
  const titleSize = spec.title.length > 76 ? 62 : spec.title.length > 52 ? 70 : 82;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: "0 138px",
        pointerEvents: "none",
        background:
          "linear-gradient(90deg,rgba(3,7,12,.91) 0%,rgba(3,7,12,.64) 52%,rgba(3,7,12,.16) 100%)",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          maxWidth: 1510,
          fontFamily: "Arial, Helvetica, sans-serif",
          textShadow: "0 6px 28px rgba(0,0,0,.76)",
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: 24,
            fontWeight: 820,
            letterSpacing: "0.22em",
            marginBottom: 22,
          }}
        >
          {spec.eyebrow}
        </div>
        <div
          style={{
            color: "#F6F2E9",
            fontSize: titleSize,
            fontWeight: 830,
            letterSpacing: "-0.03em",
            lineHeight: 1.02,
            maxWidth: 1450,
          }}
        >
          {spec.title}
        </div>
        <div
          style={{
            marginTop: 32,
            width: 220,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg,#8CB5DC,${accent})`,
            transform: `scaleX(${lineScale})`,
            transformOrigin: "left center",
            boxShadow: `0 0 24px ${accent}55`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
