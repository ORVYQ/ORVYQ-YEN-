import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

export type HookQuestionSpec = {
  eyebrow: string;
  question: string;
  deck?: string | null;
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const HookQuestion: React.FC<{
  spec: HookQuestionSpec;
  durationInFrames: number;
}> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [4, 28], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const secondBeat = interpolate(
    frame,
    [Math.round(durationInFrames * 0.28), Math.round(durationInFrames * 0.52)],
    [0, 1],
    {
      ...clamp,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    },
  );
  const deckReveal = interpolate(
    frame,
    [Math.round(durationInFrames * 0.58), Math.round(durationInFrames * 0.76)],
    [0, 1],
    clamp,
  );
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - 22), durationInFrames],
    [1, 0],
    clamp,
  );
  const opacity = enter * exit;
  const splitAt = Math.max(4, Math.floor(spec.question.length * 0.5));
  const splitSpace = spec.question.indexOf(" ", splitAt);
  const first = spec.question.slice(0, splitSpace > 0 ? splitSpace : splitAt);
  const second = spec.question.slice(splitSpace > 0 ? splitSpace + 1 : splitAt);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: "center",
        padding: "0 132px",
        background:
          "linear-gradient(90deg,rgba(3,7,12,.86) 0%,rgba(3,7,12,.52) 50%,rgba(3,7,12,.12) 100%),linear-gradient(180deg,rgba(3,7,12,.12),rgba(3,7,12,.42))",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${(1 - enter) * 26}px)`,
          maxWidth: 1510,
          fontFamily: "Arial, Helvetica, sans-serif",
          textShadow: "0 8px 36px rgba(0,0,0,.82)",
        }}
      >
        <div
          style={{
            color: "#8CB5DC",
            fontSize: 24,
            fontWeight: 880,
            letterSpacing: ".22em",
            marginBottom: 24,
          }}
        >
          {spec.eyebrow}
        </div>
        <div
          style={{
            color: "#F6F2E9",
            fontSize: 76,
            lineHeight: 1.01,
            fontWeight: 850,
            letterSpacing: "-.038em",
          }}
        >
          <span>{first}</span>
          <br />
          <span
            style={{
              display: "inline-block",
              opacity: secondBeat,
              transform: `translateY(${(1 - secondBeat) * 20}px)`,
            }}
          >
            {second}
          </span>
        </div>
        <div
          style={{
            width: 230,
            height: 5,
            marginTop: 32,
            background: "linear-gradient(90deg,#8CB5DC,#E06A63)",
            transform: `scaleX(${secondBeat})`,
            transformOrigin: "left center",
          }}
        />
        {spec.deck ? (
          <div
            style={{
              color: "#D1D6DB",
              fontSize: 29,
              lineHeight: 1.28,
              fontWeight: 620,
              marginTop: 24,
              opacity: deckReveal,
              maxWidth: 1050,
            }}
          >
            {spec.deck}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
