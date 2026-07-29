from pathlib import Path
import json

planner_path = Path("scripts/orvyq_full_production_plan.mjs")
planner = planner_path.read_text()
old = '''export function resolveEvidenceOverrideAssets(kindOverride, evidenceKind, occurrence) {
  if (!kindOverride || kindOverride.kind !== evidenceKind) return {};
  if (kindOverride.distinct_image_per_occurrence && kindOverride.evidence_asset_ids?.length) {
    const index = occurrence % kindOverride.evidence_asset_ids.length;
    return { evidence_asset_ids: [kindOverride.evidence_asset_ids[index]], image_assets: [kindOverride.image_assets[index]] };
  }
  return { evidence_asset_ids: kindOverride.evidence_asset_ids, image_assets: kindOverride.image_assets };
}'''
new = '''export function resolveEvidenceOverrideAssets(kindOverride, evidenceKind, occurrence) {
  if (!kindOverride || kindOverride.kind !== evidenceKind) return {};
  const evidenceAssetIds = kindOverride.evidence_asset_ids || [];
  const imageAssets = kindOverride.image_assets || [];
  if (evidenceAssetIds.length !== imageAssets.length)
    throw new Error(`evidence_kind_overrides ${evidenceKind} must pair every evidence_asset_id with one image_asset`);

  // Some project profiles require the first post-hook evidence shot to show a
  // small, explicit set of real documents/figures at once. The remaining
  // occurrences still rotate one image each, starting after that opening set,
  // so no source silently exceeds the global reuse cap.
  const firstOccurrenceAssetCount = Math.max(0, Math.round(Number(kindOverride.first_occurrence_asset_count) || 0));
  if (occurrence === 0 && firstOccurrenceAssetCount > 0) {
    if (firstOccurrenceAssetCount > evidenceAssetIds.length)
      throw new Error(`first_occurrence_asset_count=${firstOccurrenceAssetCount} exceeds the ${evidenceAssetIds.length} declared evidence assets`);
    return {
      evidence_asset_ids: evidenceAssetIds.slice(0, firstOccurrenceAssetCount),
      image_assets: imageAssets.slice(0, firstOccurrenceAssetCount)
    };
  }
  if (kindOverride.distinct_image_per_occurrence && evidenceAssetIds.length) {
    const rotationOffset = firstOccurrenceAssetCount > 0 ? firstOccurrenceAssetCount - 1 : 0;
    const index = (occurrence + rotationOffset) % evidenceAssetIds.length;
    return { evidence_asset_ids: [evidenceAssetIds[index]], image_assets: [imageAssets[index]] };
  }
  return { evidence_asset_ids: evidenceAssetIds, image_assets: imageAssets };
}'''
if planner.count(old) != 1:
    raise SystemExit("Could not locate resolveEvidenceOverrideAssets exactly once")
planner_path.write_text(planner.replace(old, new))

sequence_path = Path("projects/002-the-new-war-beneath-the-ocean/direction/sequence_plan.json")
sequence = json.loads(sequence_path.read_text())
opening = sequence["evidence_kind_overrides"]["CLM_001_JAPAN_TECHNICAL_MILESTONE"]
opening["kind"] = "official_figure"
opening["first_occurrence_asset_count"] = 2
opening["distinct_image_per_occurrence"] = True
opening["editorial_rationale"] = (
    "Open the post-hook evidence body with two official JAMSTEC captures together, satisfying the project profile's "
    "explicit two-asset official-figure requirement. Later native evidence slices rotate one real image at a time, "
    "starting after the opening pair and wrapping only when needed, so each source remains within the two-use cap "
    "while the film still moves from recovered material to system architecture and seabed hardware."
)
sequence_path.write_text(json.dumps(sequence, indent=2, ensure_ascii=False) + "\n")

Path(__file__).unlink()
