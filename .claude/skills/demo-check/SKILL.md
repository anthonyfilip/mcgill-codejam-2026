---
name: demo-check
description: Pre-demo / pre-submission checklist for the hackathon. Use when the user says "demo check", "are we ready to submit", or before judging.
---

Run through this list and report pass/fail for each, fixing only trivial issues
(ask before anything bigger):

1. `git status` is clean and the latest commit is pushed.
2. The app installs and starts from a fresh clone using only README commands.
3. The demo path in `docs/STATUS.md` works end to end — drive it with the
   playwright MCP if it's a web app and take a screenshot of each step.
4. No secrets in the repo: search tracked files for `sk-`, `key=`, `token`,
   and confirm `.env` is not tracked.
5. `.env.example` lists every env var the code reads.
6. README has the pitch, what it does, how it's built, and run instructions
   (these map straight onto the Devpost fields).
7. Known issues in `docs/STATUS.md` won't appear on the demo path.

End with a one-line verdict: READY or NOT READY (+ the blocking items).
