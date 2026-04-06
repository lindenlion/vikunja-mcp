---
name: Build output is committed to the repo
description: build/ files are intentionally tracked in git — Uberspace pulls and runs without a build step
type: project
---

The `build/` directory is committed to the repo so Uberspace can deploy by pulling and restarting the process without running `npm run build`.

**Why:** Uberspace deployment skips the build step for simplicity.

**How to apply:** Always stage and commit `build/` files (index.js, calendar.js, calendar.d.ts, etc.) alongside source changes. Never add `build/` to .gitignore.
