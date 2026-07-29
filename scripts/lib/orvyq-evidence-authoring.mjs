// Project-independent evidence-copy authoring. Internal semantic roles remain
// data and are never a viewer-facing presentation contract.
const MAX_EYEBROW = 60;
const MAX_TITLE = 90;

function truncateWords(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function combineTitle(prefix, main, max) {
  const mainBudget = Math.max(20, Math.round(max * 0.62));
  const mainText = truncateWords(main, mainBudget);
  const prefixBudget = Math.max(10, max - mainText.length - 2);
  return truncateWords(`${truncateWords(prefix, prefixBudget)}: ${mainText}`, max);
}

function shortClaimName(claimId) {
  return String(claimId || "claim").replace(/^CLM_\d+_/, "").replace(/_/g, " ").toLowerCase();
}

function formatDate(iso) {
  if (!iso) return "undated";
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function claimLimitation(claim, ownSources) {
  const sourceLimitation = (ownSources || []).map((source) => source?.limitation).find(Boolean);
  if (sourceLimitation) return sourceLimitation;
  if (claim?.status === "attributed_commentary") return "Attributed commentary, not a measured or universal industry finding.";
  return null;
}

const DISPLAYABLE_FACT_TYPES = new Set(["source", "narration", "section", "rewrite"]);

function buildFactPool(claim, displaySources, section) {
  const facts = [];
  for (const source of displaySources || []) facts.push({ type: "source", source });
  if (claim?.narration_excerpt) facts.push({ type: "narration", text: claim.narration_excerpt });
  if (section) facts.push({ type: "section", section });
  if (claim?.recommended_rewrite) facts.push({ type: "rewrite", text: claim.recommended_rewrite });
  return facts.filter((fact) => DISPLAYABLE_FACT_TYPES.has(fact.type));
}

function rotate(list, start) {
  if (!list.length) return list;
  const offset = ((start % list.length) + list.length) % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function factLabel(fact) {
  if (fact.type === "source") return fact.source.publisher.toUpperCase();
  if (fact.type === "narration") return "NARRATIVE";
  if (fact.type === "section") return "CHAPTER";
  if (fact.type === "rewrite") return "CLARIFICATION";
  return "SOURCE";
}

function factText(fact) {
  if (fact.type === "source") return fact.source.title;
  if (fact.type === "section") return `${fact.section.title} — ${fact.section.dramatic_function}`;
  return fact.text;
}

function factItem(fact) {
  if (fact.type === "source") return {
    label: truncateWords(fact.source.publisher.toUpperCase(), 28),
    value: formatDate(fact.source.publication_date),
    detail: truncateWords(fact.source.title, 120),
  };
  if (fact.type === "section") return {
    label: "CHAPTER",
    value: truncateWords(fact.section.title, 40),
    detail: truncateWords(fact.section.dramatic_function, 120),
  };
  return { label: factLabel(fact), value: truncateWords(fact.text, 70) };
}

function factStep(fact) {
  if (fact.type === "source") return truncateWords(`${fact.source.publisher} (${formatDate(fact.source.publication_date)}): ${fact.source.title}`, 90);
  if (fact.type === "section") return truncateWords(`${fact.section.title}: ${fact.section.dramatic_function}`, 90);
  return truncateWords(fact.text, 90);
}

const ROLE_ROTATION_OFFSET = { evidence: 0, context: 1, metaphor: 2, archive: 0 };
const ROLE_LABEL = { evidence: "SOURCE", context: "CONTEXT", metaphor: "BOUNDARY", archive: "ARCHIVE" };

export function buildEvidenceContent({ claim, kind, role, displaySources, ownSources, section, occurrence = 0 }) {
  const displayFacts = buildFactPool(claim, displaySources, section);
  const rotated = rotate(displayFacts, occurrence + (ROLE_ROTATION_OFFSET[role] || 0));
  const lead = rotated[0] || { type: "narration", text: claim?.narration_excerpt || shortClaimName(claim?.claim_id) };
  const roleLabel = ROLE_LABEL[role] || "SOURCE";
  const eyebrow = truncateWords(`${factLabel(lead)} — ${roleLabel}`, MAX_EYEBROW).toUpperCase();
  let title;
  if (lead.type === "source") title = combineTitle(lead.source.publisher, lead.source.title, MAX_TITLE);
  else if (lead.type === "section") title = combineTitle(lead.section.title, claim?.narration_excerpt, MAX_TITLE);
  else title = truncateWords(factText(lead) || claim?.narration_excerpt || shortClaimName(claim?.claim_id), MAX_TITLE);

  const limitation = claimLimitation(claim, ownSources || []);
  const body = {};
  if (kind === "source_timeline" || kind === "source_article") {
    const items = [];
    for (const fact of rotated) {
      if (items.length >= 4) break;
      const item = factItem(fact);
      if (item.value && !items.some((entry) => entry.label === item.label && entry.value === item.value)) items.push(item);
    }
    for (const fact of displayFacts) {
      if (items.length >= 2) break;
      const item = factItem(fact);
      if (item.value && !items.some((entry) => entry.label === item.label && entry.value === item.value)) items.push(item);
    }
    body.items = items.slice(0, 4);
  } else if (kind === "concept_map" || kind === "evidence_chain") {
    const steps = [];
    for (const fact of rotated) {
      if (steps.length >= 5) break;
      const step = factStep(fact);
      if (step && !steps.includes(step)) steps.push(step);
    }
    for (const fact of displayFacts) {
      if (steps.length >= 3) break;
      const step = factStep(fact);
      if (step && !steps.includes(step)) steps.push(step);
    }
    while (steps.length < 3) steps.push(truncateWords(claim?.narration_excerpt || section?.dramatic_function || title, 90));
    body.steps = [...new Set(steps)].slice(0, 5);
  } else if (kind === "comparison" || kind === "boundary") {
    const positive = rotated.find((fact) => fact.type === "narration") || rotated.find((fact) => fact.type === "rewrite") || lead;
    const primarySource = (rotated.find((fact) => fact.type === "source") || { source: (displaySources || [])[0] }).source;
    body.left = truncateWords(factText(positive) || claim?.narration_excerpt, 70);
    body.left_detail = primarySource ? truncateWords(`Per ${primarySource.publisher}, ${formatDate(primarySource.publication_date)}.`, 120) : "";
    body.right = truncateWords(limitation || "A universal or fully settled conclusion", 70);
    body.right_detail = limitation ? "" : "The available evidence does not establish a broader conclusion.";
  }
  return { eyebrow, title, ...(limitation ? { limitation } : {}), ...body };
}
