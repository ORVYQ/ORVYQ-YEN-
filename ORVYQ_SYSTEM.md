# ORVYQ System Contract

> **AUTHORITATIVE SOURCE OF TRUTH**
>
> This file defines the current ORVYQ production system. Every agent, script, workflow and project must follow it. If another README, migration document, historical plan, workflow name or code comment conflicts with this file, **this file wins**.
>
> This document must be updated whenever system behaviour changes or Project 002 reveals a new failure. Historical documents explain repository history only; they do not define the active workflow.

## 1. Validation vehicle

`002-the-new-war-beneath-the-ocean` is both a real ORVYQ documentary and the acceptance test for the reusable production system.

The system is not finished because scripts compile or CI passes. It is finished only when:

- Project 002 completes the full production chain,
- the user reviews the complete candidate,
- all blocking feedback is corrected,
- the user explicitly approves it,
- the final encode succeeds,
- and a fresh isolated project can enter the same workflow without Project 002 data leakage.

Until then, every ambiguity, wrong assumption, missing automation, infrastructure failure and creative defect must be corrected in the reusable system and recorded here.

## 2. Responsibility split

### The system is responsible for

- source collection and verification
- research, thesis development, counterarguments and evidence mapping
- English narration writing
- the ElevenLabs-ready script and recommended settings
- scene architecture, storyboard and pacing
- finding, downloading and validating footage, images, official documents and music
- source, licence, authorship, hash, duration and resolution records
- edit-plan generation, captions, audio mix, rendering and QA
- continuing automatically through Full-Length Review whenever required inputs exist

### The user is responsible for

- generating narration in ElevenLabs with the supplied script and settings
- supplying `projects/<project-id>/assets/audio/final_voice.mp3`
- reviewing the Full-Length Review
- approving or rejecting the candidate

The user must **not** be asked to find footage, images, documents, music or licences.

## 3. Canonical production flow

1. **System Research**
2. **English Narration**
3. **ElevenLabs Handoff Package**
4. **Scene Architecture and Editorial Plan**
5. **Automatic Footage, Image, Document and Music Acquisition**
6. **Wait only for `final_voice.mp3` when genuinely missing**
7. **Audio Alignment and Final Edit-Plan Materialisation**
8. **Candidate Validation**
9. **720p Full-Length Review Encode**
10. **User Review and Explicit Approval**
11. **1080p Final Encode**

The system must not stop merely to report progress, cross an internal phase boundary or request an unnecessary approval. It continues until a real external dependency or blocking validation failure exists.

## 4. Removed concept: proof

There is no separate short proof stage in the active workflow.

Terms such as `proof`, `proof approval`, `proof render`, `proof mode` and `frozen proof` may appear only in clearly historical material or legacy code awaiting removal. They must not control current production behaviour.

The first user-facing video is the **complete Full-Length Review**.

## 5. ElevenLabs handoff

Before waiting for narration, the system must provide:

- `projects/<project-id>/voice/voice_script.txt`
- voice and model recommendation
- stability, similarity, style, speed and speaker-boost settings
- output format requirements
- split/join instructions only when platform limits require them

After `final_voice.mp3` is supplied, the pipeline resumes automatically. No second user command should be required to continue toward review.

## 6. Asset acquisition

Every production asset must be repository-owned or reproducibly materialised by a workflow.

For each asset, retain as applicable:

- provider and provider asset ID
- source page URL and resolved retrieval record
- licence name and URL
- creator or publisher
- retrieval timestamp
- SHA-256 and byte size
- duration, codec and dimensions
- editorial role and scene assignment
- whether it is evidence or contextual footage

### Footage rules

- Contextual footage may come from licensed stock providers such as Pexels.
- Generic stock footage must not be presented as factual proof.
- Scientific and legal claims require official or peer-reviewed evidence assets.
- Lookalike misuse is forbidden; hydrothermal-vent footage must not represent an abyssal nodule field.
- Excessive clip reuse is forbidden.
- Acquisition must prefer edit-ready 720p/1080p files rather than unnecessary 4K masters.
- Acquired clips should be trimmed or transcoded to the required editorial window.

### Semantic visual relevance rule

Every visual, video, document, map, animation or graphic must directly explain, emphasise or meaningfully support the word, sentence, claim, event, object or emotion being narrated at that moment. General topic similarity alone is not sufficient visual fitness. Blind visual assignment by file order, asset index, keyword match or the need to fill a duration gap is forbidden. The real content of an asset must be inspected (frame-by-frame or by direct viewing, not filename or provider metadata alone) and its semantic relationship to the narration verified before assignment.

If the existing asset pool has no semantically fitting visual, the correct response is not to reuse an unrelated asset to pass quality control. Acquire a new licensed asset with a search query built directly from the narrated sentence, event or object, or author an original source-derived map, diagram, comparison or evidence composition instead.

### Storage rules

- No normal-Git media blob may exceed GitHub’s per-file limit.
- Media must not be routed blindly through Git LFS.
- Use normal Git for compact review-ready assets, Git LFS only when intentionally configured and operational, and workflow artifacts for temporary large outputs.
- A successful download followed by a failed commit or push is a blocking system failure.
- Attribute validation must reject only an active `filter=lfs`; both `unset` and `unspecified` correctly mean that the LFS filter is inactive.

## 7. Candidate Validation

Candidate Validation is a blocking automated gate over the exact complete candidate inputs.

It must verify at minimum:

- narration/script alignment
- claim-to-source coverage
- evidence integrity and authority
- semantic visual suitability
- provenance and licensing
- clip reuse
- scene timing and pacing
- music continuity and cue placement
- mobile legibility
- caption alignment
- audio integrity
- renderability
- absence of placeholders and unapproved fallbacks

A failed candidate is repaired internally. It is not presented to the user as review-ready.

## 8. Full-Length Review

The review is the complete film, not a sample.

It must use the same:

- complete timeline and narration
- scene order and shot selection
- documents and evidence
- graphics, typography and captions
- transitions
- music, pauses and audio balance
- colour treatment and editorial decisions

Only delivery encoding is lighter:

- resolution: **1280×720**
- codec: H.264
- target video bitrate: approximately **3–5 Mbps**
- audio: AAC at review-suitable quality
- frame rate: identical to final

The review must remain clear enough to judge documents, typography, transitions, visual relevance and audio balance.

## 9. Final Encode

Final Encode starts only after explicit approval of the Full-Length Review.

Default target:

- resolution: **1920×1080**
- the exact approved canonical timeline
- higher delivery quality
- no unapproved editorial changes

Any editorial change after approval requires a new Full-Length Review.

## 10. Project isolation

Each video lives under `projects/<project-id>/`.

A new project must not inherit another project’s footage, images, music, research, claims, narration, audio, scene assignments, approvals, QA reports or runtime manifests.

Reusable logic belongs outside project directories. Project-specific facts and assets belong only inside their own project directory.

## 11. Creative quality target

The benchmark is Aperture (`@ApertureThinking`), especially:

- restrained, confident narration
- premium cinematic video-essay atmosphere
- intentional visual storytelling rather than document/card accumulation
- footage that reflects the narrated moment
- elegant, readable typography
- controlled pacing and meaningful pauses
- music that remains present under narration and carries pauses
- clear evidence without turning the film into a slideshow

Technical validity alone is not sufficient.

## 12. Continuous correction rule

Every Project 002 failure must be classified as:

- project-data defect
- reusable-system defect
- workflow/infrastructure defect
- external dependency
- creative-quality defect

Reusable defects must be fixed in shared code or workflows, not patched only inside Project 002.

After every meaningful discovery, update the live acceptance record and change log below.

## 13. Definition of done

- [ ] Research and narration pass factual QA
- [x] ElevenLabs handoff script and settings are available
- [ ] User narration is ingested and aligned
- [ ] Footage acquisition completes without manual hunting or push failure
- [ ] Official evidence acquisition completes
- [ ] Music acquisition and licensing complete
- [ ] Provenance and licence audits pass
- [ ] Candidate Validation passes on the complete film
- [ ] A 720p Full-Length Review is generated
- [ ] User corrections are collected and applied
- [ ] Reusable defects discovered during review are fixed system-wide
- [ ] A corrected Full-Length Review passes again
- [ ] The user explicitly approves the candidate
- [ ] The 1080p Final Encode succeeds
- [ ] A fresh blank project proves isolation and repeatability

## 14. Live acceptance record — Project 002

Project: `002-the-new-war-beneath-the-ocean`

Branch: `agent/002-deep-sea-cold-war`

Current status (last verified 2026-07-27, mid full-film coverage/validation pass):

- Research dossier, source catalog and claim map: complete
- English narration (~2,216 words) and ElevenLabs-ready script: complete
- `final_voice.mp3` (~16m35s): supplied by the user, present at `assets/audio/final_voice.mp3`
- Contextual footage acquisition: PASS (run `30227021870`) — 20 licensed compact Pexels clips, runtime/provenance manifests committed
- Official evidence acquisition: PASS (run `30228891705`) — JAMSTEC and ISA official evidence assets present and marked ready
- Full-film semantic visual coverage: hand-authored and verified. Every new footage break was assigned only after the real clip content was frame-inspected (contact sheets, all 20 clips) and matched to the claim it interrupts; break placement is computed from the real per-slice durations in the last verified narration alignment (run `30257567458`), not guessed. `node scripts/orvyq_full_production_plan.mjs` now returns `ok:true` (147 shots, 1037.68s) — run `30269505202` — with zero unresolved creative-coverage gaps
- Reusable defects found and fixed while reaching that point: `orvyq_full_production_plan.mjs`'s graphic-recap `maxSeconds` shrink logic threw against fixed/near-full slice neighbors (two real failures, both root-caused and fixed by only capping cards with real donor room); `resolved_pause_plan.schema.json` rejected the real `question` field `orvyq-pause-resolver.mjs` has always written; `editorial_pauses.schema.json` required a positive legacy `proof_duration_seconds` even for a project built entirely after proof's retirement; `orvyq-music-acquisition.yml` was hardcoded to project 001 despite its underlying script already being project-agnostic
- Music: Project 002 had no `music_cue_sheet.json` at all (candidate validation had never previously reached that stage). Authored one hand-built from the shared, already-licensed `music_library/registry.json` (`sb_undertow`, Scott Buckley, CC BY 4.0) as a single tonal world across all seven editorial sections, matching `config/music_acquisition.json`'s own creative direction — no new external fetch required
- Candidate Validation: in progress on this entry — do not treat as passed until a specific run ID is recorded here with conclusion `success`
- Full-Length Review: not started
- Final Encode: forbidden until explicit user approval of a completed Full-Length Review

## 15. Change log

### 2026-07-27 — Authoritative contract established

- Created a single source of truth for all agents, scripts and workflows.
- Defined Project 002 as the live acceptance test.
- Removed the short-proof concept from active production.
- Fixed the responsibility split: the user supplies narration only; the system supplies all other production assets.
- Defined automatic progression toward Candidate Validation and Full-Length Review.
- Defined 720p review and 1080p final contracts.
- Replaced the root README entrypoint and active script documentation.
- Retired the old proof-based migration plan as active guidance.

### 2026-07-27 — Footage acquisition lessons

- Recorded the unnecessary 4K-selection defect and compact-media repair.
- Recorded the blanket Git LFS routing defect and project-specific plain-Git exception.
- Recorded the `unset` versus `unspecified` attribute-validation defect.
- Changed validation to reject only an active LFS filter.

### 2026-07-27 — Semantic visual relevance rule and full-film coverage authoring

- A prior coverage-authoring attempt closed the film's 15s uninterrupted-evidence-run gaps by index-matching footage (`full_footage_pool[15]`, `[16]`, …) to claims without checking real clip content, and by forcing `span=2` footage placements that overran a clip's real duration (`run 30261751903` failure). Rejected as exactly the blind assignment this contract forbids.
- Added the permanent **semantic visual relevance rule** (section 6): every visual must directly support the narrated word/sentence/claim/event, blind index/keyword/duration-gap assignment is forbidden, and an unfitting asset must never be reused to pass QA — acquire a new licensed asset with a narration-specific query, or author a source-derived graphic instead.
- Re-authored Project 002's full-film coverage by frame-inspecting all 20 licensed clips (contact sheets) against their real content, cross-referencing each of the 15 claims' real narration text and evidence requirements, then computing exact real per-slice durations from the last verified alignment (run `30257567458`) to place each of the 54 required breaks precisely instead of guessing spacing. `orvyq_full_production_plan.mjs` now passes with zero coverage gaps (run `30269505202`).
- Fixed reusable defects this authoring pass exposed: `shrinkGraphicBreakSliceToMax` threw on a graphic card with no real donor-neighbor capacity (two distinct real cases); `resolved_pause_plan.schema.json` and `editorial_pauses.schema.json` were both out of date against real script output/data. Authored Project 002's first-ever `music_cue_sheet.json` from the shared licensed registry, and parameterized `orvyq-music-acquisition.yml` (previously hardcoded to project 001) by `project_id`.
