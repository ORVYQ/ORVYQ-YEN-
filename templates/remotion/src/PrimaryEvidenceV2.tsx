import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EvidenceFocus, EvidenceItem, PrimaryEvidenceSpec } from "./types/evidence";

const INK = "#F6F2E9";
const MUTED = "#C7CED6";
const BLUE = "#8CB5DC";
const RED = "#E06A63";
const GROUND = "#060D16";
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

const FrameMark: React.FC = () => (
  <div style={{ position: "absolute", left: 68, top: 48, display: "flex", alignItems: "center", gap: 12, color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, fontWeight: 850, letterSpacing: ".24em", zIndex: 20 }}>
    <span style={{ width: 9, height: 9, borderRadius: 99, background: RED, boxShadow: "0 0 0 6px rgba(224,106,99,.12)" }} />ORVYQ
  </div>
);

const Header: React.FC<{ spec: PrimaryEvidenceSpec; compact?: boolean }> = ({ spec, compact = false }) => (
  <div style={{ position: "absolute", left: 68, right: 68, top: compact ? 91 : 92, zIndex: 12, fontFamily: "Arial, Helvetica, sans-serif" }}>
    <div style={{ color: BLUE, fontSize: 22, lineHeight: 1.08, letterSpacing: ".16em", fontWeight: 900 }}>{spec.eyebrow}</div>
    <div style={{ color: INK, fontSize: Math.max(44, (spec.font_px || 36) + 10), lineHeight: 1.01, letterSpacing: "-.034em", fontWeight: 860, marginTop: 11, maxWidth: compact ? 1160 : 1680 }}>{spec.title}</div>
    {spec.subtitle ? <div style={{ color: MUTED, fontSize: 28, lineHeight: 1.22, fontWeight: 570, marginTop: 12, maxWidth: 1460 }}>{spec.subtitle}</div> : null}
  </div>
);

const SourceFooter: React.FC<{ spec: PrimaryEvidenceSpec }> = ({ spec }) => (
  <div style={{ position: "absolute", left: 68, right: 68, bottom: 126, zIndex: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 24, lineHeight: 1.15, fontWeight: 800, letterSpacing: ".04em", color: MUTED }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><span style={{ width: 9, height: 9, borderRadius: 99, background: BLUE, flex: "0 0 auto" }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spec.source_label}</span></div>
    <span style={{ color: "rgba(246,242,233,.55)", whiteSpace: "nowrap" }}>SOURCE-DERIVED</span>
  </div>
);

const Limitation: React.FC<{ text?: string }> = ({ text }) => text ? (
  <div style={{ position: "absolute", left: 68, right: 68, bottom: 166, zIndex: 18, borderLeft: `5px solid ${RED}`, background: "linear-gradient(90deg,rgba(224,106,99,.22),rgba(7,14,23,.78) 72%,rgba(7,14,23,.18))", color: INK, padding: "13px 18px 14px", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 25, lineHeight: 1.2, fontWeight: 730, boxShadow: "0 18px 48px rgba(0,0,0,.28)" }}>{text}</div>
) : null;

const BackgroundImage: React.FC<{ src: string; progress: number }> = ({ src, progress }) => (
  <AbsoluteFill>
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${interpolate(progress, [0, 1], [1.05, 1.12], clamp)})`, filter: "blur(22px) brightness(.27) saturate(.72) contrast(1.08)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg,rgba(4,9,15,.84),rgba(4,9,15,.36) 58%,rgba(4,9,15,.72)),linear-gradient(180deg,rgba(4,9,15,.2),rgba(4,9,15,.68))" }} />
  </AbsoluteFill>
);

const EvidenceImage: React.FC<{ src: string; progress: number; focus?: EvidenceFocus; contain?: boolean; style?: React.CSSProperties }> = ({ src, progress, focus, contain = true, style }) => {
  const scale = interpolate(progress, [0, 1], [1, focus?.scale ?? (contain ? 1.045 : 1.08)], clamp);
  const x = interpolate(progress, [0, 1], [0, focus?.x ?? 0], clamp);
  const y = interpolate(progress, [0, 1], [0, focus?.y ?? 0], clamp);
  return <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: contain ? "#E9E7E1" : "#101720", border: "1px solid rgba(246,242,233,.24)", boxShadow: "0 30px 100px rgba(0,0,0,.58)", ...style }}><Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: contain ? "contain" : "cover", objectPosition: "center", transform: `translate(${x}%,${y}%) scale(${scale})`, filter: "contrast(1.04) saturate(.95)" }} /></div>;
};

const ImageEvidenceStage: React.FC<{ spec: PrimaryEvidenceSpec; progress: number }> = ({ spec, progress }) => {
  const images = spec.image_assets || [];
  const main = images[0];
  if (!main) return null;
  if (spec.kind === "split_documents") return (
    <>
      <BackgroundImage src={main} progress={progress} />
      <Header spec={spec} compact />
      <div style={{ position: "absolute", left: 610, right: 70, top: 196, bottom: spec.limitation ? 235 : 172, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, zIndex: 6 }}>
        {images.slice(0, 2).map((asset, index) => <EvidenceImage key={asset} src={asset} progress={progress} focus={{ scale: 1.045, x: index ? -.4 : .4, y: -1 }} contain style={{ borderRadius: 8, transform: `translateY(${index ? 12 : 0}px)` }} />)}
      </div>
    </>
  );
  if (spec.kind === "image_sequence" || spec.kind === "recap") return (
    <>
      <BackgroundImage src={main} progress={progress} />
      <Header spec={spec} compact />
      <div style={{ position: "absolute", left: 600, right: 68, top: 204, bottom: spec.limitation ? 236 : 174, display: "grid", gridTemplateColumns: images.length > 2 ? "1fr 1fr" : "1fr", gap: 14, zIndex: 6 }}>
        {images.slice(0, 4).map((asset, index) => <EvidenceImage key={asset} src={asset} progress={progress} contain={spec.kind !== "image_sequence"} style={{ borderRadius: 7, transform: `translateY(${index % 2 ? 8 : 0}px)` }} />)}
      </div>
    </>
  );
  return (
    <>
      <BackgroundImage src={main} progress={progress} />
      <Header spec={spec} compact />
      <div style={{ position: "absolute", left: spec.callout ? 620 : 520, right: 68, top: 198, bottom: spec.limitation ? 236 : 174, zIndex: 6 }}>
        <EvidenceImage src={main} progress={progress} focus={spec.focus || { scale: spec.kind === "official_document" ? 1.12 : 1.045, x: 0, y: spec.kind === "official_document" ? -2 : 0 }} contain style={{ borderRadius: 8 }} />
      </div>
      {spec.callout ? <div style={{ position: "absolute", left: 68, width: 500, top: 438, zIndex: 8, color: INK, borderLeft: `5px solid ${BLUE}`, paddingLeft: 22, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 31, lineHeight: 1.22, fontWeight: 730 }}>{spec.callout}</div> : null}
    </>
  );
};

const ItemLine: React.FC<{ item: EvidenceItem; index: number; reveal: number; align: "left" | "right" }> = ({ item, index, reveal, align }) => {
  const local = interpolate(reveal, [Math.min(.72, index * .11), Math.min(1, .38 + index * .11)], [0, 1], clamp);
  return <div style={{ opacity: local, transform: `translateY(${(1 - local) * 22}px)`, borderTop: "1px solid rgba(246,242,233,.17)", padding: "20px 0 18px", textAlign: align, fontFamily: "Arial, Helvetica, sans-serif" }}><div style={{ color: index % 2 ? RED : BLUE, fontSize: 22, letterSpacing: ".12em", fontWeight: 900 }}>{item.label}</div><div style={{ color: INK, fontSize: 38, lineHeight: 1.06, fontWeight: 830, marginTop: 9 }}>{item.value}</div>{item.detail ? <div style={{ color: MUTED, fontSize: 26, lineHeight: 1.23, fontWeight: 560, marginTop: 11 }}>{item.detail}</div> : null}</div>;
};

const NativeEvidenceStage: React.FC<{ spec: PrimaryEvidenceSpec; reveal: number; progress: number }> = ({ spec, reveal, progress }) => {
  const presentation = spec.presentation || "cinematic_field";
  const align: "left" | "right" = presentation === "cinematic_split" ? "right" : "left";
  const items = spec.items || [];
  const steps = spec.steps || [];
  if (["boundary", "comparison"].includes(spec.kind)) {
    const columns = [
      { label: "SUPPORTS", title: spec.left || "", detail: spec.left_detail || "", color: BLUE },
      { label: "DOES NOT ESTABLISH", title: spec.right || "", detail: spec.right_detail || "", color: RED }
    ];
    return <div style={{ position: "absolute", left: 72, right: 72, top: 286, bottom: spec.limitation ? 250 : 184, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 54 }}>{columns.map((column, index) => <div key={column.label} style={{ opacity: interpolate(reveal, [index * .13, .48 + index * .13], [0, 1], clamp), borderTop: `5px solid ${column.color}`, paddingTop: 28 }}><div style={{ color: column.color, fontSize: 23, fontWeight: 900, letterSpacing: ".13em" }}>{column.label}</div><div style={{ color: INK, fontSize: 48, lineHeight: 1.04, fontWeight: 850, marginTop: 20 }}>{column.title}</div><div style={{ color: MUTED, fontSize: 29, lineHeight: 1.28, marginTop: 22 }}>{column.detail}</div></div>)}</div>;
  }
  if (steps.length) return <div style={{ position: "absolute", left: 80, right: 80, top: 300, bottom: spec.limitation ? 250 : 184, display: "flex", alignItems: "center", gap: 18 }}>{steps.map((step, index) => { const local = interpolate(reveal, [index / Math.max(1, steps.length), Math.min(1, (index + 1.15) / Math.max(1, steps.length))], [0, 1], clamp); return <React.Fragment key={step}><div style={{ flex: 1, opacity: local, borderTop: `5px solid ${index === steps.length - 1 ? RED : BLUE}`, paddingTop: 24 }}><div style={{ color: index === steps.length - 1 ? RED : BLUE, fontSize: 22, fontWeight: 900, letterSpacing: ".12em" }}>{String(index + 1).padStart(2, "0")}</div><div style={{ color: INK, fontSize: 35, lineHeight: 1.12, fontWeight: 800, marginTop: 16 }}>{step}</div></div>{index < steps.length - 1 ? <div style={{ color: BLUE, fontSize: 38, opacity: local }}>→</div> : null}</React.Fragment>; })}</div>;
  const visibleItems = items.slice(0, spec.density === "reduced" ? 3 : 4);
  return <div style={{ position: "absolute", left: presentation === "cinematic_split" ? 760 : 82, right: presentation === "cinematic_split" ? 82 : 600, top: 275, bottom: spec.limitation ? 242 : 178, display: "flex", flexDirection: "column", justifyContent: "center" }}>{visibleItems.map((item, index) => <ItemLine key={`${item.label}-${item.value}`} item={item} index={index} reveal={reveal} align={align} />)}<div style={{ position: "absolute", top: "10%", bottom: "10%", [presentation === "cinematic_split" ? "left" : "right"]: -110, width: 3, background: `linear-gradient(${BLUE},${RED})`, transform: `scaleY(${interpolate(progress, [0, 1], [.15, 1], clamp)})`, transformOrigin: "top" }} /></div>;
};

export const PrimaryEvidenceV2: React.FC<{ spec: PrimaryEvidenceSpec; durationInFrames: number }> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 24, stiffness: 96, mass: .9 }, durationInFrames: Math.min(38, durationInFrames) });
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp);
  const isImageEvidence = ["split_documents", "official_document", "official_figure", "official_screen", "image_sequence", "recap"].includes(spec.kind);
  return <AbsoluteFill style={{ opacity: reveal, background: `radial-gradient(circle at ${22 + progress * 12}% 20%,rgba(140,181,220,.16),transparent 34%),linear-gradient(145deg,#0B1521 0%,${GROUND} 62%,#04080E 100%)`, overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif" }}><AbsoluteFill style={{ opacity: .12, backgroundImage: "linear-gradient(rgba(140,181,220,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(140,181,220,.12) 1px,transparent 1px)", backgroundSize: "96px 96px", transform: `translate(${progress * -12}px,${progress * -8}px)` }} /><FrameMark />{isImageEvidence ? <ImageEvidenceStage spec={spec} progress={progress} /> : <><Header spec={spec} /><NativeEvidenceStage spec={spec} reveal={reveal} progress={progress} /></>}<Limitation text={spec.limitation} /><SourceFooter spec={spec} /></AbsoluteFill>;
