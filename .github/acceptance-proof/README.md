# ORVYQ synthetic acceptance proof

This directory contains the temporary, project-independent acceptance proof harness for the canonical ORVYQ renderer.

## Asset-path contract

`templates/remotion/remotion.config.ts` exposes the project root with `Config.setPublicDir("../../")`. Synthetic proof assets must therefore be generated under the repository-root `assets/` directory and referenced as `assets/...` in the canonical edit plan.

Do not generate proof media under `templates/remotion/public/`. That location does not match the production renderer contract and can make `staticFile("assets/...")` resolve to a missing `/public/assets/...` path.

## Scope

The proof harness may create synthetic project data, assets and reports, but it must not change selector behavior, renderer behavior, schemas, quality thresholds, production project data or Project 002 content. Generic CI gates must pass before the proof job starts, and proof artifacts are uploaded only after render and media validation complete successfully.
