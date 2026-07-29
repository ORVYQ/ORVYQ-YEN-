import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { PrimaryEvidenceSpec } from "../types/evidence";
import type { OrvyqGraphicSpec } from "../OrvyqGraphic";
import type { CinematicVisualModuleSpec } from "./types";
import { SourceAttribution } from "./SourceAttribution";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const INK = "#F6F2E9";
const MUTED = "#C7D0D8";
const BLUE = "#91B7D7";
const RED = "#E06A63";

const Text: React.FC<{ primary?: string | null; secondary?: string | null; align?: "left" | "right" }> = ({ primary, secondary, align = "left" }) => (
  <div style={{ maxWidth: 920, textAlign: align, fontFamily: "Arial, Helvetica, sans-serif", textShadow: "0 6px 26px rgba(0,0,0,.82)" }}>
    {primary ? <div style={{ color: INK, fontSize: 50, lineHeight: 1.06, fontWeight: 740, letterSpacing: "-.03em" }}>{primary}</div> : null}
    {secondary ? <div style={{ color: MUTED, fontSize: 25, lineHeight: 1.3, marginTop: 18 }}>{secondary}</div> : null}
  </div>
);

const MotionGround: React.FC<{ progress: number; seed?: string }> = ({ progress, seed }) => (
  <AbsoluteFill style={{ background: "radial-gradient(circle at 22% 18%,rgba(83,137,180,.22),transparent 38%),linear-gradient(140deg,#07111B,#02060B 72%)", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: -120, opacity: .15, backgroundImage: "linear-gradient(rgba(145,183,215,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(145,183,215,.18) 1px,transparent 1px)", backgroundSize: "90px 90px", transform: `translate(${progress * -24}px,${progress * -16}px)` }} />
    <div style={{ position: "absolute", left: 74, top: 54, color: "rgba(246,242,233,.22)", fontFamily: "Arial", fontSize: 13, letterSpacing: ".2em" }}>{String(seed || "ORVYQ").replace(/[_-]+/g, " ").toUpperCase().slice(0, 44)}</div>
  </AbsoluteFill>
);

function source(spec: CinematicVisualModuleSpec) {
  return <SourceAttribution text={spec.visible_text.source} method={spec.source_display_method} subtitleClearance={spec.safe_areas.subtitle_clearance_px} />;
}

function assetOf(spec: CinematicVisualModuleSpec, evidence?: PrimaryEvidenceSpec) {
  return spec.primary_visual.asset || evidence?.image_assets?.[0] || null;
}

export const CinematicVisualModule: React.FC<{
  spec: CinematicVisualModuleSpec;
  evidence?: PrimaryEvidenceSpec;
  graphic?: OrvyqGraphicSpec;
  durationInFrames: number;
  assetType: "footage" | "ai_fallback" | "graphic" | "evidence";
}> = ({ spec, evidence, durationInFrames, assetType }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp);
  const module = spec.selected_visual_module;
  const asset = assetOf(spec, evidence);
  const src = asset ? staticFile(asset) : null;
  const clearance = spec.safe_areas.subtitle_clearance_px;

  if (module === "cinematic_footage_overlay") return <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill style={{ background: "linear-gradient(90deg,rgba(3,7,12,.62),rgba(3,7,12,.03) 70%)" }} />
    <div style={{ position: "absolute", left: 82, bottom: clearance + 42, opacity: interpolate(progress, [0, .3], [0, 1], clamp) }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>
    {source(spec)}
  </AbsoluteFill>;

  if (module === "document_dive") return <AbsoluteFill style={{ background: "#03070C", overflow: "hidden" }}>
    <MotionGround progress={progress} seed="document dive" />
    {src ? <div style={{ position: "absolute", left: 620, right: 80, top: 64, bottom: clearance + 34, overflow: "hidden", background: "#ECEAE4", boxShadow: "0 32px 100px rgba(0,0,0,.7)" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center top", transform: `scale(${1.02 + progress * .09}) translateY(${-progress * 2}%)`, transformOrigin: "center top" }} />
      <div style={{ position: "absolute", left: "8%", right: "8%", top: `${36 + progress * 10}%`, height: 4, background: RED }} />
    </div> : null}
    <div style={{ position: "absolute", left: 82, top: 170, width: 470 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>
    {source(spec)}
  </AbsoluteFill>;

  if (module === "comparison_composition") return <AbsoluteFill style={{ background: "#040A11" }}>
    <MotionGround progress={progress} seed="comparison" />
    <div style={{ position: "absolute", left: 74, top: 140, width: 980, padding: 42, borderLeft: `5px solid ${BLUE}`, background: "rgba(8,22,34,.78)" }}><Text primary={spec.visible_text.left || spec.visible_text.primary} /></div>
    <div style={{ position: "absolute", right: 74, bottom: clearance + 26, width: 820, padding: 42, borderRight: `5px solid ${RED}`, background: "rgba(30,12,17,.78)" }}><Text primary={spec.visible_text.right || spec.visible_text.secondary} align="right" /></div>
    {source(spec)}
  </AbsoluteFill>;

  if (module === "mechanism_explainer") {
    const steps = (evidence?.steps || [spec.visible_text.primary, spec.visible_text.secondary]).filter(Boolean).slice(0, 4) as string[];
    return <AbsoluteFill style={{ background: "#040A11" }}><MotionGround progress={progress} seed="mechanism" />
      <div style={{ position: "absolute", left: 82, right: 82, top: 190, display: "flex", alignItems: "center", gap: 20 }}>
        {steps.map((step, index) => <React.Fragment key={`${step}-${index}`}><div style={{ flex: 1, minHeight: 300, padding: 30, borderTop: `4px solid ${index === steps.length - 1 ? RED : BLUE}`, background: "rgba(8,20,31,.72)" }}><div style={{ color: BLUE, fontSize: 18 }}>{String(index + 1).padStart(2, "0")}</div><div style={{ color: INK, fontSize: 30, lineHeight: 1.15, marginTop: 22 }}>{step}</div></div>{index < steps.length - 1 ? <div style={{ color: BLUE, fontSize: 34 }}>→</div> : null}</React.Fragment>)}
      </div>{source(spec)}</AbsoluteFill>;
  }

  if (module === "data_scene") {
    const items = (evidence?.items || []).slice(0, 5);
    return <AbsoluteFill style={{ background: "#040A11" }}><MotionGround progress={progress} seed="data" />
      <div style={{ position: "absolute", left: 82, top: 110, width: 720 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>
      <div style={{ position: "absolute", left: 850, right: 90, top: 180, bottom: clearance + 20, display: "flex", alignItems: "flex-end", gap: 26 }}>
        {items.map((item, index) => { const reveal = interpolate(progress, [index * .1, .55 + index * .06], [0, 1], clamp); return <div key={`${item.label}-${index}`} style={{ flex: 1 }}><div style={{ color: INK, fontSize: 24, marginBottom: 12 }}>{item.value}</div><div style={{ height: `${Math.max(12, (index + 2) * 14) * reveal}%`, minHeight: 10, background: `linear-gradient(${BLUE},rgba(145,183,215,.18))` }} /><div style={{ color: MUTED, fontSize: 16, marginTop: 12 }}>{item.label}</div></div>; })}
      </div>{source(spec)}</AbsoluteFill>;
  }

  if (module === "timeline_reconstruction") {
    const items = (evidence?.items || []).slice(0, 5);
    return <AbsoluteFill style={{ background: "#040A11" }}><MotionGround progress={progress} seed="timeline" />
      <div style={{ position: "absolute", left: 82, top: 110, width: 820 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 520, height: 4, background: "rgba(145,183,215,.25)" }}><div style={{ width: `${progress * 100}%`, height: "100%", background: BLUE }} /></div>
      {items.map((item, index) => { const x = 130 + index * (1600 / Math.max(1, items.length - 1)); return <div key={`${item.label}-${index}`} style={{ position: "absolute", left: x, top: index % 2 ? 550 : 380, width: 270, transform: "translateX(-50%)", textAlign: "center" }}><div style={{ width: 13, height: 13, borderRadius: 99, background: index === items.length - 1 ? RED : BLUE, margin: "0 auto 14px" }} /><div style={{ color: INK, fontSize: 23 }}>{item.value}</div><div style={{ color: MUTED, fontSize: 16, marginTop: 8 }}>{item.label}</div></div>; })}{source(spec)}
    </AbsoluteFill>;
  }

  if (module === "map_scene") return <AbsoluteFill style={{ background: "#03080E" }}><MotionGround progress={progress} seed="map" />
    {src ? <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: .65, transform: `scale(${1.02 + progress * .04})` }} /> : null}
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}><path d="M260 720 C620 420,1040 690,1590 280" fill="none" stroke={BLUE} strokeWidth="5" strokeDasharray="18 16" strokeDashoffset={(1 - progress) * 500} /><circle cx="260" cy="720" r="12" fill={INK} /><circle cx="1590" cy="280" r="14" fill={RED} /></svg>
    <div style={{ position: "absolute", left: 82, top: 160, width: 760 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>{source(spec)}
  </AbsoluteFill>;

  if (module === "editorial_emphasis_moment" || module === "chapter_transition") {
    const transition = module === "chapter_transition";
    return <AbsoluteFill style={{ pointerEvents: "none", background: assetType === "footage" ? "transparent" : "#03080E" }}>
      {assetType !== "footage" ? <MotionGround progress={progress} seed={spec.primary_visual.seed || module} /> : null}
      <AbsoluteFill style={{ background: transition ? "linear-gradient(90deg,rgba(3,7,12,.72),rgba(3,7,12,.08))" : "linear-gradient(90deg,rgba(3,7,12,.8),rgba(3,7,12,.06) 70%)" }} />
      <div style={{ position: "absolute", left: transition ? 110 : 90, top: transition ? 330 : undefined, bottom: transition ? undefined : clearance + 48 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>
    </AbsoluteFill>;
  }

  return <AbsoluteFill style={{ background: "#040A11" }}><MotionGround progress={progress} seed={spec.primary_visual.seed || "evidence lens"} />
    {src ? <Img src={src} style={{ position: "absolute", right: -30, top: -20, width: "62%", height: "82%", objectFit: "cover", clipPath: "polygon(12% 0,100% 0,100% 100%,0 90%)", opacity: .82, transform: `scale(${1.02 + progress * .05})` }} /> : null}
    <div style={{ position: "absolute", left: 82, top: 220, width: 760 }}><Text primary={spec.visible_text.primary} secondary={spec.visible_text.secondary} /></div>{source(spec)}
  </AbsoluteFill>;
};
