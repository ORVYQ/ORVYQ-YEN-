# ORVYQ System Contract

> **AUTHORITATIVE SOURCE OF TRUTH**
>
> This file defines the current ORVYQ production system. Every agent, script, workflow and project must follow it. If another README, migration document, historical plan, workflow name or code comment conflicts with this file, **this file wins**.
>
> This document must be updated in the same change that alters system behaviour. Historical documents may explain how the repository evolved, but they do not define the active workflow.

## 1. Current validation vehicle

`002-the-new-war-beneath-the-ocean` is both a real ORVYQ documentary and the acceptance test for the reusable production system.

The system is not considered finished merely because scripts pass. It is considered finished only when Project 002 completes the entire production chain, the user reviews the full-length candidate, all blocking feedback is corrected, the user explicitly approves it, and the final encode is produced successfully.

Until that point, every discovered failure, ambiguity, wrong assumption, missing automation or quality defect must be corrected in the reusable system and recorded in this document.

## 2. Non-negotiable responsibility split

### The system is responsible for

- source collection and verification
- research, thesis development, counterarguments and evidence mapping
- English narration writing
- the ElevenLabs-ready narration file and recommended voice settings
- scene architecture, storyboard and editorial pacing
- finding, downloading and validating footage, images and official documents
- recording source URLs, licences, authorship, hashes, duration and resolution
- music selection, acquisition, licensing and cue design
- edit-plan generation, captions, audio mix, rendering and QA
- continuing automatically through Full-Length Review whenever all required inputs exist

### The user is responsible for

- generating the narration in ElevenLabs with the supplied script and settings
- supplying the resulting `final_voice.mp3`
- reviewing the Full-Length Review video
- approving or rejecting the candidate

The user must **not** be asked to find footage, images, documents, music or licences.

## 3. Canonical production flow

The active ORVYQ flow is:

1. **System Research**
2. **English Narration**
3. **ElevenLabs Handoff Package**
4. **Scene Architecture and Editorial Plan**
5. **Automatic Footage, Image, Document and Music Acquisition**
6. **Wait only for user-supplied `final_voice.mp3` when it is genuinely missing**
7. **Audio Alignment and Final Edit-Plan Materialisation**
8. **Candidate Validation**
9. **Full-Length Review Encode**
10. **User Review and Explicit Approval**
11. **Final Encode**

The system must not stop for progress reporting, an internal phase transition or an unnecessary approval request. It continues automatically until a real external dependency or blocking validation failure exists.

## 4. Removed concept: proof

There is no separate short proof stage in the active ORVYQ workflow.

The words `proof`, `proof approval`, `proof render`, `proof mode` and `frozen proof` may appear only inside clearly marked historical migration material. They must not control current production behaviour.

The first user-facing video is the **full-length review candidate**.

## 5. ElevenLabs handoff contract

Before waiting for narration, the system must provide:

- the complete English narration in `projects/<project-id>/voice/voice_script.txt`
- voice/model recommendation
- stability, similarity, style, speed and speaker-boost settings
- output format requirements
- clear instructions for splitting and joining the narration only when platform limits require it

The system then waits only for:

`projects/<project-id>/assets/audio/final_voice.mp3`

After the file is supplied, the pipeline resumes automatically. No second user command should be required to continue toward review.

## 6. Asset acquisition contract

All production assets must be repository-owned or reproducibly materialised by a workflow.

For each footage, image, evidence or music asset, the system must retain as applicable:

- provider and provider asset ID
- source page URL
- direct resolved source or retrieval record
- licence name and licence URL
- creator or publisher
- retrieval timestamp
- SHA-256
- byte size
- duration, codec and dimensions for media
- editorial role and scene assignment
- whether the asset may be used as evidence or only as context

### Footage rules

- Contextual footage may come from licensed stock services such as Pexels.
- Scientific or historical claims must not be visually “proven” with generic stock footage.
- Official evidence must use official documents, charts, photographs, maps or clearly attributed institutional media.
- Incorrect lookalike footage is forbidden; for example, hydrothermal-vent imagery must not represent an abyssal nodule field.
- The same clip must not be repeated excessively.
- Acquisition must select edit-ready files rather than unnecessarily large source masters.
- Default acquired contextual footage target: 720p or 1080p landscape, trimmed to the required editorial window.

### Storage rules

- No individual normal-Git media blob may exceed GitHub’s hard file limit.
- The system must not blindly route every generated media asset through Git LFS.
- Storage choice must be deliberate: normal Git for compact review-ready assets, Git LFS only when configured, available and genuinely necessary, or workflow artifacts for temporary large outputs.
- A successful download followed by a failed repository push is a system failure and must be repaired automatically.

## 7. Candidate Validation

Candidate Validation is a blocking automated gate over the exact full-length candidate inputs.

It must verify at minimum:

- narration/script alignment
- claim-to-source coverage
- evidence asset integrity
- footage semantic suitability
- provenance and licensing
- scene timing and pacing
- music continuity and cue placement
- mobile legibility
- caption timing
- audio integrity
- renderability
- absence of placeholders or unapproved fallbacks

A failed validation must produce a precise report and trigger repair work. It must not be presented to the user as a review-ready candidate.

## 8. Full-Length Review contract

The Full-Length Review is the complete film, not a sample.

It must contain the same:

- total timeline and narration
- scene order and shot selection
- documents and evidence
- graphics and typography
- captions
- transitions
- music, pauses and audio balance
- colour treatment and editorial decisions

Only delivery encoding may be lighter:

- resolution: **1280×720**
- codec: H.264
- target video bitrate: approximately **3–5 Mbps**
- audio: AAC at a review-suitable bitrate
- frame rate: identical to final

The review must remain clear enough to inspect documents, typography, transitions, visual relevance and audio balance. Extremely low-resolution proxy rendering is forbidden.

## 9. Final Encode contract

Final Encode starts only after the user gives explicit approval of the Full-Length Review candidate.

Default final target:

- resolution: **1920×1080**
- same canonical timeline and creative decisions as the approved review
- higher-quality delivery bitrate/codec settings
- no unapproved editorial changes after review

Any editorial change after approval invalidates that approval and requires a new Full-Length Review.

## 10. Project isolation

Every video lives entirely under:

`projects/<project-id>/`

A new project must not inherit another project’s:

- footage or images
- music
- research or claims
- narration or audio
- scene assignments
- approvals
- QA results
- runtime manifests

Reusable logic belongs outside project directories. Project-specific facts and assets belong only inside their project directory.

## 11. Quality target

The creative benchmark is Aperture (`@ApertureThinking`), especially:

- restrained, confident narration
- premium cinematic video-essay atmosphere
- intentional visual storytelling rather than document/card accumulation
- footage that reflects the narrated moment
- readable, elegant typography
- controlled pacing and meaningful pauses
- music that remains present under narration and carries pauses
- evidence presented clearly without turning the film into a slideshow

A technically valid video is not sufficient. The Full-Length Review must also meet this creative standard.

## 12. Continuous correction rule

Project 002 is a live system test. Every failure must be classified as one of:

- project-data defect
- reusable-system defect
- workflow/infrastructure defect
- external dependency
- creative-quality defect

Reusable defects must be fixed in shared code or shared workflow configuration, not patched only inside Project 002.

After each meaningful discovery, update the **Live acceptance record** and **Change log** below.

## 13. Definition of done

ORVYQ may be declared production-ready only when all items are true:

- [ ] Project 002 research and narration are approved by automated factual QA
- [ ] ElevenLabs handoff is complete and reproducible
- [ ] User narration is ingested and aligned
- [ ] Footage acquisition succeeds without manual asset hunting
- [ ] Official evidence acquisition succeeds
- [ ] Music acquisition and licensing succeed
- [ ] All provenance and licence audits pass
- [ ] Candidate Validation passes on the complete film
- [ ] A 720p Full-Length Review is generated
- [ ] The user can inspect and provide corrections
- [ ] All blocking corrections are applied to the reusable system where applicable
- [ ] A corrected Full-Length Review passes again
- [ ] The user explicitly states that the candidate is approved
- [ ] The 1080p Final Encode succeeds from the approved canonical timeline
- [ ] A fresh blank project can enter the same workflow without Project 002 data leakage

## 14. Live acceptance record — Project 002

Current project: `002-the-new-war-beneath-the-ocean`

Current branch: `agent/002-deep-sea-cold-war`

Current status:

- Research dossier, source catalog and claim map: complete
- English narration and ElevenLabs-ready script: complete
- Scene architecture and editorial direction: complete
- Pexels credential: configured and verified
- Contextual footage search/download/validation: functionally successful
- Initial acquisition defect: selector preferred unnecessary 4K files, producing an approximately 4.8 GB set
- Repair: acquisition now selects compact 720p/1080p edit-ready windows
- Latest compact acquisition result: 20 validated clips, approximately 175.4 MB total
- Remaining footage blocker at the time of this entry: repository push/storage rule still being corrected after blanket MP4 Git LFS routing caused the commit step to fail
- Official evidence acquisition: configured; end-to-end materialisation still must pass
- Music acquisition: pending
- User-supplied `final_voice.mp3`: pending
- Candidate Validation: not yet eligible
- Full-Length Review: not started
- Final Encode: forbidden until explicit approval

## 15. Change log

### 2026-07-27 — Contract created

- Established this file as the repository’s single authoritative system document.
- Defined Project 002 as the acceptance test for the final reusable system.
- Removed the short-proof concept from the active workflow.
- Fixed responsibility split: the user supplies only ElevenLabs narration; the system supplies all visual, documentary and music assets.
- Defined uninterrupted progression toward Candidate Validation and Full-Length Review.
- Defined 720p review and 1080p final delivery contracts.
- Recorded the 4K acquisition/storage failure and compact-footage repair as system lessons.
