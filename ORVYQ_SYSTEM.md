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

Current status:

- Research dossier, source catalog and claim map: complete
- English narration and ElevenLabs-ready script: complete
- Scene architecture and editorial direction: complete
- Pexels credential: configured and verified
- Contextual footage search/download/validation: successful
- Initial acquisition defect: selector preferred unnecessary 4K files, producing approximately 4.8 GB
- First repair: selector changed to compact 720p/1080p edit-ready windows
- Compact acquisition result: 20 validated clips, approximately 175.4 MB total
- Second defect: blanket MP4 Git LFS routing blocked repository push
- Second repair: Project 002 compact footage explicitly removed from LFS filtering
- Third defect: workflow incorrectly required `filter: unspecified`; Git correctly reported the explicit `-filter` rule as `filter: unset`
- Third repair: workflow now rejects only `filter: lfs` and accepts both valid non-LFS states
- Latest failed acquisition run: `30225243889`, failure confined to the commit-step attribute check
- Corrective workflow commit: `1415abf10e18582d40eb891cf9988aa813602ebb`
- Next acquisition retry: triggered by the corrective workflow commit; result pending at this entry
- Official evidence acquisition: configured; end-to-end materialisation still pending
- Music acquisition: pending
- User-supplied `final_voice.mp3`: pending
- Candidate Validation: not yet eligible
- Full-Length Review: not started
- Final Encode: forbidden until explicit approval

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
