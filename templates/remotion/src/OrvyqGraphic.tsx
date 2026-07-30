import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type OrvyqGraphicSpec = {
  type: string;
  family?: string;
  kicker?: string;
  title: string;
  subtitle?: string;
  labels?: string[];
  source?: string;
  mode?: "brand" | "comparison" | "evidence" | "process" | "statement";
  presentation?: "cinematic";
  mobile_font_px?: number;
};

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const INK = "#F6F2E9";
const MUTED = "#C5CBD2";
const RED = "#E06A63";
const BLUE = "#8CB5DC";

const modeFor = (spec: OrvyqGraphicSpec) => {
  if (["brand_open", "brand_close"].includes(spec.type)) return "brand";
  if (["evaluation", "scenario", "fire_drill", "open_closed", "audit_tradeoff", "defense_balance", "forecast_diverge"].includes(spec.type)) return "comparison";
  if (["report_scan", "compute_threshold"].includes(spec.type)) return "evidence";
  if (["safeguards", "compliance_stack", "sunset"].includes(spec.type)) return "process";
  return "statement";
};

const Mark: React.FC = () => <div style={{ position: "absolute", left: 68, top: 52, display: "flex", alignItems: "center", gap: 12, color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, fontWeight: 850, letterSpacing: ".24em" }}><span style={{ width: 9, height: 9, borderRadius: 99, background: RED, boxShadow: "0 0 0 6px rgba(224,106,99,.12)" }} />ORVYQ</div>;

const Brand: React.FC<{ spec: OrvyqGraphicSpec; reveal: number }> = ({ spec, reveal }) => <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "7%", background: "radial-gradient(circle at 50% 42%,#2A425A 0%,#0B1521 44%,#04070C 100%)" }}><div style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 28}px)`, maxWidth: 1500 }}><div style={{ color: BLUE, letterSpacing: ".3em", fontSize: 24, fontWeight: 850, marginBottom: 30 }}>{spec.kicker}</div><div style={{ color: INK, fontSize: spec.type === "brand_close" ? 90 : 102, lineHeight: .98, fontWeight: 820, letterSpacing: "-.045em" }}>{spec.title}</div>{spec.subtitle ? <div style={{ color: MUTED, fontSize: 34, lineHeight: 1.34, marginTop: 30 }}>{spec.subtitle}</div> : null}<div style={{ width: 240, height: 4, margin: "42px auto 0", background: `linear-gradient(90deg,${BLUE},${RED})`, transform: `scaleX(${reveal})` }} /></div></AbsoluteFill>;

const Comparison: React.FC<{ spec: OrvyqGraphicSpec; progress: number }> = ({ spec, progress }) => {
  const labels = spec.labels?.length === 2 ? spec.labels : ["WHAT THE TEST SHOWS", "WHAT IT DOES NOT PROVE"];
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, width: "100%", paddingTop: 12 }}>{labels.map((label, index) => { const show = interpolate(progress, [.06 + index * .14, .46 + index * .14], [0, 1], clamp); const color = index ? RED : BLUE; return <div key={label} style={{ opacity: show, transform: `translateY(${(1 - show) * 24}px)`, borderTop: `5px solid ${color}`, paddingTop: 28 }}><div style={{ color, fontSize: 23, letterSpacing: ".14em", fontWeight: 900 }}>{index ? "LIMIT" : "MEANING"}</div><div style={{ color: INK, fontSize: 45, lineHeight: 1.08, fontWeight: 830, marginTop: 20 }}>{label}</div></div>; })}</div>;
};

const Evidence: React.FC<{ spec: OrvyqGraphicSpec; progress: number }> = ({ spec, progress }) => {
  const rows = (spec.labels?.length ? spec.labels : ["Published source", "Claim under discussion", "Context and limitation"]).slice(0, 3);
  return <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>{rows.map((row, index) => { const show = interpolate(progress, [.06 + index * .11, .4 + index * .11], [0, 1], clamp); return <div key={row} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 22, alignItems: "center", padding: "22px 0", borderTop: "1px solid rgba(246,242,233,.2)", opacity: show }}><span style={{ color: index === rows.length - 1 ? RED : BLUE, fontSize: 24, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span><span style={{ color: INK, fontSize: 38, lineHeight: 1.16, fontWeight: 760 }}>{row}</span></div>; })}{spec.source ? <div style={{ color: MUTED, fontSize: 24, lineHeight: 1.2, marginTop: 28 }}>Source: {spec.source}</div> : null}</div>;
};

const Process: React.FC<{ spec: OrvyqGraphicSpec; progress: number }> = ({ spec, progress }) => {
  const labels = (spec.labels?.length ? spec.labels : ["CONSTRAIN", "AUDIT", "REPORT", "VERIFY"]).slice(0, 4);
  return <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 18 }}>{labels.map((label, index) => { const show = interpolate(progress, [.05 + index * .11, .34 + index * .11], [0, 1], clamp); return <React.Fragment key={label}><div style={{ flex: 1, opacity: show, borderTop: `5px solid ${index === labels.length - 1 ? RED : BLUE}`, paddingTop: 24 }}><div style={{ color: index === labels.length - 1 ? RED : BLUE, fontSize: 23, fontWeight: 900, letterSpacing: ".12em" }}>{String(index + 1).padStart(2, "0")}</div><div style={{ color: INK, fontSize: 34, lineHeight: 1.12, fontWeight: 800, marginTop: 16 }}>{label}</div></div>{index < labels.length - 1 ? <div style={{ color: BLUE, fontSize: 38, opacity: show }}>→</div> : null}</React.Fragment>; })}</div>;
};

const Statement: React.FC<{ spec: OrvyqGraphicSpec; progress: number }> = ({ spec, progress }) => {
  const signal = spec.labels?.[0];
  const reveal = interpolate(progress, [.05, .5], [0, 1], clamp);
  return <div style={{ width: "100%", minHeight: 330, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>{signal ? <div style={{ color: INK, fontSize: 126, lineHeight: .9, fontWeight: 840, letterSpacing: "-.055em", opacity: reveal, transform: `translateX(${(1 - reveal) * 24}px)` }}>{signal}</div> : <div style={{ color: INK, fontSize: 58, lineHeight: 1.05, fontWeight: 820, opacity: reveal }}>{spec.title}</div>}<div style={{ width: "70%", height: 4, background: `linear-gradient(90deg,${BLUE},${RED})`, marginTop: 40, transform: `scaleX(${reveal})`, transformOrigin: "left" }} /></div>;
};

export const OrvyqGraphic: React.FC<{ spec: OrvyqGraphicSpec; durationInFrames: number }> = ({ spec, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp);
  const reveal = spring({ frame, fps, config: { damping: 21, stiffness: 102, mass: .9 }, durationInFrames: Math.min(durationInFrames, 36) });
  const mode = spec.mode || modeFor(spec);
  if (mode === "brand") return <Brand spec={spec} reveal={reveal} />;
  return <AbsoluteFill style={{ color: INK, padding: "5.4% 6.4%", background: `radial-gradient(circle at ${20 + progress * 15}% 22%,rgba(140,181,220,.17),transparent 34%),linear-gradient(140deg,#111D2B 0%,#08111C 58%,#060A10 100%)`, overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif" }}><AbsoluteFill style={{ opacity: .1, backgroundImage: "linear-gradient(rgba(140,181,220,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(140,181,220,.12) 1px,transparent 1px)", backgroundSize: "104px 104px", transform: `translate(${progress * -12}px,${progress * -8}px)` }} /><Mark /><div style={{ display: "grid", gridTemplateColumns: "minmax(430px,.72fr) minmax(700px,1.28fr)", gap: 72, alignItems: "center", flex: 1, paddingTop: 60, zIndex: 2 }}><div style={{ opacity: reveal, transform: `translateX(${(1 - reveal) * -28}px)` }}><div style={{ color: BLUE, letterSpacing: ".18em", fontSize: 23, fontWeight: 900, marginBottom: 22 }}>{spec.kicker || "EDITORIAL CONTEXT"}</div><div style={{ color: INK, fontSize: 62, lineHeight: 1.03, fontWeight: 840, letterSpacing: "-.035em" }}>{spec.title}</div>{spec.subtitle ? <div style={{ color: MUTED, fontSize: 31, lineHeight: 1.35, marginTop: 26 }}>{spec.subtitle}</div> : null}</div><div style={{ display: "flex", alignItems: "center", minHeight: 420 }}>{mode === "comparison" ? <Comparison spec={spec} progress={progress} /> : mode === "evidence" ? <Evidence spec={spec} progress={progress} /> : mode === "process" ? <Process spec={spec} progress={progress} /> : <Statement spec={spec} progress={progress} />}</div></div></AbsoluteFill>;
};
