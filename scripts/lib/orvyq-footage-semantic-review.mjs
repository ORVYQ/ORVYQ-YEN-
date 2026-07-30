export function auditFootageSemanticReviews({ footageAssets, provenanceByPath, reviews }) {
  const rejectedByProviderId = new Map(
    (reviews.rejected_assets || []).map((asset) => [String(asset.provider_asset_id), asset]),
  );
  const approvalsByProviderId = new Map(
    (reviews.approved_assets || []).map((asset) => [String(asset.provider_asset_id), asset]),
  );
  const failures = [];
  const rejected = [];
  const pending = [];

  for (const assetPath of [...new Set(footageAssets)]) {
    const provenance = provenanceByPath.get(assetPath);
    if (!provenance) {
      failures.push(`${assetPath}: provenance is missing`);
      continue;
    }
    const providerId = String(provenance.provider_asset_id || "");
    const rejection = rejectedByProviderId.get(providerId);
    if (rejection) {
      rejected.push({
        asset_path: assetPath,
        provider_asset_id: providerId,
        reason: rejection.reason,
      });
      failures.push(`${assetPath}: globally rejected semantic match (${rejection.reason})`);
      continue;
    }
    const approval = approvalsByProviderId.get(providerId);
    if (!approval) {
      pending.push({ asset_path: assetPath, provider_asset_id: providerId });
      failures.push(`${assetPath}: pending claim-specific contact-sheet review`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/i.test(String(approval.contact_sheet_sha256 || ""))) {
      failures.push(`${assetPath}: approval lacks contact_sheet_sha256`);
    }
    if (!approval.claim_id || !approval.narration_anchor || String(approval.semantic_rationale || "").length < 24) {
      failures.push(`${assetPath}: approval lacks claim_id, narration_anchor, or semantic_rationale`);
    }
    if (approval.asset_sha256 !== provenance.sha256) {
      failures.push(`${assetPath}: approval does not match current asset bytes`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    rejected,
    pending,
    reviewed_asset_count: new Set(footageAssets).size,
  };
}
