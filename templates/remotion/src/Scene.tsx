import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EditorialOverlay, EditorialOverlaySpec } from "./EditorialOverlay";
import { OrvyqGraphic, OrvyqGraphicSpec } from "./OrvyqGraphic";
import { PrimaryEvidenceSpec } from "./types/evidence";
import { PrimaryEvidenceV2 } from "./PrimaryEvidenceV2";
import { DocumentEvidenceSequence } from "./DocumentEvidenceSequence";
import { EmphasisCard, EmphasisCardSpec } from "./EmphasisCard";
import { CinematicVisualModule } from "./visual-modules/CinematicVisualModule";
import type { CinematicVisualModuleSpec } from "./visual-modules/types";

export type CameraMotion = { type: string; params: Record<string, number | string> };
export type FootageMotion = "hold" | "push" | "pull" | "drift_left" | "drift_right";
type SceneProps = {
  assetType: "footage" | "ai_fallback" | "graphic" | "evidence";
  imageSrc?: string;
  cameraMotion?: CameraMotion;
  videoSrc?: string;
  trimInSec?: number;
  trimOutSec?: number;
  motionVariant?: FootageMotion;
  graphic?: OrvyqGraphicSpec;
  evidence?: PrimaryEvidenceSpec;
  visualModule?: CinematicVisualModuleSpec | null;
  editorialOverlay?: EditorialOverlaySpec | null;
  emphasisCard?: EmphasisCardSpec | null;
  durationInFrames: number;
  textOverlay: string | null;
  transitionIn: string;
  transitionOut: string;
};

function footageTransform(variant: FootageMotion, progress: number) {
  if (variant === "push") return `scale(${interpolate(progress, [0, 1], [1.025, 1.085])})`;
  if (variant === "pull") return `scale(${interpolate(progress, [0, 1], [1.085, 1.025])})`;
  if (variant === "drift_left") return `scale(1.075) translateX(${interpolate(progress, [0, 1], [1.8, -1.8])}%)`;
  if (variant === "drift_right") return `scale(1.075) translateX(${interpolate(progress, [0, 1], [-1.8, 1.8])}%)`;
  return "scale(1.035)";
}

export const Scene: React.FC<SceneProps> = ({ assetType, imageSrc, videoSrc, trimInSec, trimOutSec, motionVariant = "hold", graphic, evidence, visualModule = null, editorialOverlay = null, emphasisCard = null, durationInFrames, textOverlay, transitionIn, transitionOut }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeFrames = Math.min(15, Math.max(1, Math.floor(durationInFrames / 4)));
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let opacity = 1;
  if (transitionIn === "fade" || transitionIn === "dissolve") opacity *= interpolate(frame, [0, fadeFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (transitionOut === "fade" || transitionOut === "dissolve") opacity *= interpolate(frame, [durationInFrames - fadeFrames, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const legacyCanvas = !visualModule;
  return <AbsoluteFill style={{ backgroundColor: assetType === "footage" ? "black" : "transparent" }}>
    <AbsoluteFill style={{ opacity }}>
      {assetType === "footage" && videoSrc ? <OffthreadVideo src={videoSrc} muted startFrom={Math.round((trimInSec ?? 0) * fps)} endAt={Math.round((trimOutSec ?? (trimInSec ?? 0) + durationInFrames / fps) * fps)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: footageTransform(motionVariant, progress), filter: "contrast(1.055) saturate(.9) brightness(.94)" }} />
        : visualModule ? <CinematicVisualModule spec={visualModule} evidence={evidence} graphic={graphic} durationInFrames={durationInFrames} assetType={assetType} />
        : assetType === "graphic" && graphic ? <OrvyqGraphic spec={graphic} durationInFrames={durationInFrames} />
        : assetType === "evidence" && evidence ? (evidence.kind === "image_sequence" ? <DocumentEvidenceSequence spec={evidence} durationInFrames={durationInFrames} /> : <PrimaryEvidenceV2 spec={evidence} durationInFrames={durationInFrames} />)
        : <Img src={imageSrc ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </AbsoluteFill>

    {visualModule && assetType === "footage" ? <AbsoluteFill style={{ opacity }}><CinematicVisualModule spec={visualModule} evidence={evidence} graphic={graphic} durationInFrames={durationInFrames} assetType={assetType} /></AbsoluteFill> : null}
    {legacyCanvas && assetType !== "graphic" && editorialOverlay ? <EditorialOverlay spec={editorialOverlay} durationInFrames={durationInFrames} /> : null}
    {legacyCanvas && assetType === "footage" && emphasisCard ? <EmphasisCard spec={emphasisCard} durationInFrames={durationInFrames} /> : null}
    {legacyCanvas && textOverlay && !editorialOverlay && !emphasisCard && assetType !== "evidence" ? <div style={{ position: "absolute", left: 68, top: 70, color: "#F5F0E7", background: "rgba(8,14,22,.72)", padding: "14px 18px", fontFamily: "Arial", fontSize: 28 }}>{textOverlay}</div> : null}
  </AbsoluteFill>;
};
