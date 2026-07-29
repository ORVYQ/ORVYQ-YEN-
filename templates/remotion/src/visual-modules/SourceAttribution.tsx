import React from "react";

export const SourceAttribution: React.FC<{
  text?: string | null;
  method: "document_margin" | "subtle_footer" | "corner_attribution" | "narration_only";
  subtitleClearance: number;
}> = ({ text, method, subtitleClearance }) => {
  if (!text || method === "narration_only") return null;
  const corner = method === "corner_attribution";
  const margin = method === "document_margin";
  return (
    <div
      style={{
        position: "absolute",
        left: corner ? undefined : 72,
        right: 72,
        bottom: subtitleClearance,
        maxWidth: margin ? 520 : 900,
        color: "rgba(246,242,233,.78)",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 18,
        fontWeight: 650,
        letterSpacing: ".035em",
        lineHeight: 1.25,
        textAlign: corner ? "right" : "left",
        textShadow: "0 3px 18px rgba(0,0,0,.85)",
      }}
    >
      {text}
    </div>
  );
};
