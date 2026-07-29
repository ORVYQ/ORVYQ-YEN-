import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { PrimaryEvidenceSpec } from "./types/evidence";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const DocumentEvidenceSequence: React.FC<{
  spec: PrimaryEvidenceSpec;
  durationInFrames: number;
}> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const images = spec.image_assets || [];
  if (!images.length) return null;
  const framesPerDocument = durationInFrames / images.length;
  const activeIndex = Math.min(images.length - 1, Math.floor(frame / Math.max(1, framesPerDocument)));
  const localFrame = frame - activeIndex * framesPerDocument;
  const localProgress = localFrame / Math.max(1, framesPerDocument);
  const opacity = interpolate(localProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0], clamp);
  const scale = interpolate(localProgress, [0, 1], [1.015, 1.08], clamp);
  const activeImage = images[activeIndex];
  const sourceName = spec.source_label || "Verified source";

  return (
    <AbsoluteFill style={{ background: "#050A11", overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <Img src={staticFile(activeImage)} style={{ position: "absolute", inset: -80, width: "calc(100% + 160px)", height: "calc(100% + 160px)", objectFit: "cover", filter: "blur(34px) brightness(.22) saturate(.6)", transform: `scale(${1.06 + localProgress * .03})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(90deg,rgba(3,7,12,.92),rgba(3,7,12,.46) 38%,rgba(3,7,12,.18) 72%,rgba(3,7,12,.52))" }} />
      <div style={{ position: "absolute", left: 72, top: 142, width: 430, zIndex: 12 }}>
        <div style={{ color: "#F6F2E9", fontSize: 44, fontWeight: 760, lineHeight: 1.04, letterSpacing: "-.03em" }}>{spec.title}</div>
        <div style={{ color: "#C8CED5", fontSize: 24, lineHeight: 1.28, marginTop: 22 }}>{sourceName}</div>
      </div>
      <div style={{ position: "absolute", left: 540, right: 72, top: 72, bottom: 205, zIndex: 8, opacity, overflow: "hidden", background: "#ECEAE4", borderRadius: 7, boxShadow: "0 36px 120px rgba(0,0,0,.65)" }}>
        <Img src={staticFile(activeImage)} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center top", transform: `scale(${scale})`, transformOrigin: "center top", filter: "contrast(1.06) saturate(.96)" }} />
        <div style={{ position: "absolute", left: "8%", right: "8%", top: `${35 + localProgress * 13}%`, height: 4, background: "#E06A63", boxShadow: "0 0 20px rgba(224,106,99,.48)" }} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 156, color: "rgba(246,242,233,.72)", fontSize: 19, display: "flex", justifyContent: "space-between" }}>
        <span>{sourceName}</span><span>{String(activeIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
      </div>
    </AbsoluteFill>
  );
};
