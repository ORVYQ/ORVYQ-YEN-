import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { PrimaryEvidenceSpec } from "./types/evidence";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const DocumentEvidenceSequence: React.FC<{
  spec: PrimaryEvidenceSpec;
  durationInFrames: number;
}> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const images = spec.image_assets || [];
  if (!images.length) return null;

  const framesPerDocument = durationInFrames / images.length;
  const activeIndex = Math.min(
    images.length - 1,
    Math.floor(frame / Math.max(1, framesPerDocument)),
  );
  const localFrame = frame - activeIndex * framesPerDocument;
  const localProgress = localFrame / Math.max(1, framesPerDocument);
  const documentOpacity =
    interpolate(localProgress, [0, 0.1], [0, 1], clamp) *
    interpolate(localProgress, [0.88, 1], [1, 0], clamp);
  const scale = interpolate(localProgress, [0, 1], [1.015, 1.07], clamp);
  const activeImage = images[activeIndex];
  const sourceNames = [
    "ANTHROPIC — RESPONSIBLE SCALING POLICY",
    "ANTHROPIC — EXECUTIVE SUMMARY",
    "GOOGLE DEEPMIND — FRONTIER SAFETY FRAMEWORK",
  ];
  const activeSourceName = sourceNames[activeIndex] || spec.source_label;

  return (
    <AbsoluteFill
      style={{
        background: "#050A11",
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <Img
        src={staticFile(activeImage)}
        style={{
          position: "absolute",
          inset: -80,
          width: "calc(100% + 160px)",
          height: "calc(100% + 160px)",
          objectFit: "cover",
          filter: "blur(34px) brightness(.23) saturate(.65)",
          transform: `scale(${1.06 + localProgress * 0.03})`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg,rgba(3,7,12,.92) 0%,rgba(3,7,12,.58) 30%,rgba(3,7,12,.2) 68%,rgba(3,7,12,.5) 100%),linear-gradient(180deg,rgba(3,7,12,.14),rgba(3,7,12,.58))",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 70,
          top: 58,
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#F6F2E9",
          fontSize: 21,
          fontWeight: 850,
          letterSpacing: ".23em",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 99,
            background: "#E06A63",
          }}
        />
        ORVYQ
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          top: 146,
          width: 430,
          zIndex: 12,
        }}
      >
        <div
          style={{
            color: "#8CB5DC",
            fontSize: 21,
            fontWeight: 900,
            letterSpacing: ".16em",
            lineHeight: 1.15,
          }}
        >
          PUBLISHED EVIDENCE
        </div>
        <div
          style={{
            color: "#F6F2E9",
            fontSize: 43,
            fontWeight: 840,
            letterSpacing: "-.035em",
            lineHeight: 1.03,
            marginTop: 15,
          }}
        >
          {spec.title}
        </div>
        <div
          style={{
            color: "#C8CED5",
            fontSize: 27,
            fontWeight: 590,
            lineHeight: 1.28,
            marginTop: 20,
          }}
        >
          {activeSourceName}
        </div>
        <div
          style={{
            color: "#E06A63",
            fontSize: 22,
            fontWeight: 850,
            letterSpacing: ".12em",
            marginTop: 30,
          }}
        >
          DOCUMENT {String(activeIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 540,
          right: 72,
          top: 82,
          bottom: 205,
          zIndex: 8,
          opacity: documentOpacity,
          overflow: "hidden",
          background: "#ECEAE4",
          border: "1px solid rgba(246,242,233,.34)",
          borderRadius: 7,
          boxShadow: "0 36px 120px rgba(0,0,0,.65)",
        }}
      >
        <Img
          src={staticFile(activeImage)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center top",
            transform: `scale(${scale})`,
            transformOrigin: "center top",
            filter: "contrast(1.06) saturate(.96)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          right: 72,
          bottom: 155,
          zIndex: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#C8CED5",
          fontSize: 23,
          fontWeight: 760,
          letterSpacing: ".035em",
        }}
      >
        <span>{activeSourceName}</span>
        <span style={{ color: "rgba(246,242,233,.6)" }}>REAL PDF PAGE CAPTURE</span>
      </div>
    </AbsoluteFill>
  );
};
