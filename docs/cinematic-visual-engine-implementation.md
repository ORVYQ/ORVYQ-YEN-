# ORVYQ Cinematic Visual Engine and Opening System

This document is a normative extension of `ORVYQ_SYSTEM.md` for the cinematic visual engine implementation. If implementation details below conflict with historical card/proof documentation, this document and the current system contract win.

## System independence

All visual-planning, module-selection, renderer and QA behavior is project-independent. Shared runtime code must not contain a real project ID, claim ID, project asset filename, source ID, publisher-specific behavior, video title or historical run ID. Project-specific facts and assets remain under `projects/<project-id>/`.

## Semantic and presentation separation

A canonical shot has two distinct layers:

1. `semantic_intent`: internal editorial meaning such as evidence relationship, certainty, narrative function and source visibility requirement.
2. `visual_module`: viewer-facing cinematic presentation selected from real asset availability, narrative need and recent layout history.

Internal semantic labels are not display instructions. Terms such as `PRIMARY EVIDENCE`, `EDITORIAL CONTEXT`, `FILM CLAIM`, `SECTION CONTEXT`, `SOURCE-DERIVED`, `SUPPORTS` and `DOES NOT ESTABLISH` are hidden by default and are rejected by metadata-leakage QA unless an explicit presentation intent authorizes a restrained label.

## Canonical visual modules

The single canonical renderer supports:

- cinematic footage overlay
- document dive
- evidence lens
- comparison composition
- mechanism explainer
- data scene
- timeline reconstruction
- map scene
- editorial emphasis moment
- chapter transition

These are components inside the existing Remotion composition, not a second renderer or parallel pipeline.

Every module must declare a primary visual foundation, motion behavior, source-display method, subtitle-safe area, mobile minimum typography and fail-loud fallback policy. Automatic full-screen card fallback is forbidden.

## Opening engine

The opening engine generates and scores multiple candidates from the available canonical edit plan, narration question, evidence and visual assets. Supported archetypes are:

- contradiction
- human consequence
- object mystery
- scale revelation
- decision point
- archival rupture

Candidates are scored for specificity, concreteness, visual showability, curiosity, stakes, non-genericity, early supportability, real-asset availability, central-question strength and narration–visual alignment. The highest-scoring feasible candidate is recorded in `direction/opening_plan.json`.

The title cannot appear on the first frame. The opening must contain at least two visual module types, establish a central question and reach verified evidence within 45 seconds.

## Blocking QA

Candidate Validation includes blocking gates for:

- presentation look
- visual diversity
- metadata leakage
- opening quality
- text density
- motion continuity
- system independence

The audits are project-independent and have positive and negative unit fixtures. QA thresholds cannot be weakened to pass a specific film.

## Legacy compatibility

Legacy `graphic` and `evidence` fields remain readable during migration. New production must run cinematic visual planning before QA and rendering. The canonical renderer uses `visual_module` when present; legacy card components remain only as a temporary compatibility path and are not selected by the new planner.

## Acceptance proof

The system acceptance proof is a temporary, synthetic, low-cost evaluation package produced only after static, schema, unit and renderer tests pass. It is not the retired production proof stage and it does not authorize a Full-Length Review or Final Encode.
