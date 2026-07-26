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

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const EmphasisCard: React.FC<{
  spec: EmphasisCardSpec;
  durationInFrames: number;
}> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const isBriefAccent = durationInFrames <= 90;
  const enterFrames = isBriefAccent ? 10 : 20;
  const exitFrames = isBriefAccent ? 9 : 18;
  const enter = interpolate(frame, [0, enterFrames], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    ...clamp,
  });
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - exitFrames), durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(0.64, 0, 0.78, 0),
      ...clamp,
    },
  );
  const opacity = enter * exit;
  const translateY = interpolate(enter, [0, 1], [isBriefAccent ? 18 : 26, 0]);
  const lineScale = interpolate(frame, [4, isBriefAccent ? 16 : 30], [0, 1], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    ...clamp,
  });
  const accent = spec.accent || "#E06A63";
  const fullTitleSize = spec.title.length > 76 ? 54 : spec.title.length > 52 ? 60 : 68;
  const titleSize = isBriefAccent ? (spec.title.length > 62 ? 42 : 48) : fullTitleSize;

  return (
    <AbsoluteFill
      style={{
        justifyContent: isBriefAccent ? "flex-end" : "center",
        padding: isBriefAccent ? "0 138px 122px" : "0 146px",
        pointerEvents: "none",
        background: isBriefAccent
          ? "linear-gradient(180deg,rgba(3,7,12,0) 30%,rgba(3,7,12,.18) 62%,rgba(3,7,12,.72) 100%)"
          : "linear-gradient(90deg,rgba(3,7,12,.84) 0%,rgba(3,7,12,.54) 54%,rgba(3,7,12,.08) 100%)",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          maxWidth: isBriefAccent ? 1080 : 1320,
          fontFamily: "Arial, Helvetica, sans-serif",
          textShadow: "0 6px 26px rgba(0,0,0,.78)",
        }}
      >
        <div
          style={{
            color: isBriefAccent ? "#A8BED2" : accent,
            fontSize: isBriefAccent ? 17 : 20,
            fontWeight: 800,
            letterSpacing: isBriefAccent ? ".18em" : ".2em",
            marginBottom: isBriefAccent ? 13 : 20,
          }}
        >
          {isBriefAccent ? "CONSIDER" : spec.eyebrow}
        </div>
        <div
          style={{
            color: "#F6F2E9",
            fontSize: titleSize,
            fontWeight: isBriefAccent ? 650 : 730,
            letterSpacing: isBriefAccent ? "-.022em" : "-.03em",
            lineHeight: isBriefAccent ? 1.08 : 1.04,
            maxWidth: isBriefAccent ? 1080 : 1320,
          }}
        >
          {spec.title}
        </div>
        <div
          style={{
            marginTop: isBriefAccent ? 18 : 28,
            width: isBriefAccent ? 74 : 128,
            height: 2,
            background: isBriefAccent ? "rgba(156,185,212,.9)" : accent,
            transform: `scaleX(${lineScale})`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
