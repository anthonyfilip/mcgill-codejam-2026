# CLAUDE.md — McGill CodeJam 2026

<!--
Built from human-written guidance, not generated from scratch:
- Anthropic, "Claude Code: Best practices for agentic coding" — keep this file short,
  list real commands, say what NOT to do, iterate on it like a prompt.
- Boris Cherny (Claude Code team) — the team CLAUDE.md is checked into git and every
  time Claude makes a mistake, a one-line rule is added so it doesn't happen again.
- Andrej Karpathy's observations on LLM coding pitfalls (as distilled in the popular
  "karpathy-guidelines" CLAUDE.md): state assumptions, simplicity first, surgical
  changes, define verifiable success criteria.
- Kent Beck, "Augmented Coding" / Tidy First — small steps, keep tests green,
  never separate structural and behavioural changes in the same commit.
Rule of thumb: if a line here wouldn't change Claude's behaviour, delete it.
-->

## Project
- **What:** TODO — one sentence on what we're building and for whom.
- **Track / sponsor prize:** TODO
- **Deadline:** TODO (submission time, Devpost link). Demo > completeness.
- More context: [docs/architecture.md](docs/architecture.md) · progress: [docs/STATUS.md](docs/STATUS.md)

## Stack & commands
TODO — fill in once the stack is chosen. Keep these exact and copy-pasteable.
- Install: `TODO`
- Dev server: `TODO`
- Test: `TODO`
- Lint/format: `TODO`
- Deploy: `TODO`

## How to work
1. **Think before coding.** State assumptions out loud. If a request is ambiguous,
   ask one question instead of guessing. If there's a simpler approach, say so.
2. **Simplest thing that demos.** No speculative abstractions, config options, or
   "future-proofing". It's a 24-hour hackathon — hardcode it, then move on.
3. **Surgical changes.** Touch only what the task needs. Don't reformat, rename,
   or "improve" unrelated code. Match the existing style.
4. **Define done before starting.** Turn each task into a check you can run
   (a test, a curl, a page that loads). Loop until it passes, then stop.
5. **Small commits.** Commit after every working step with a clear message so we
   can always `git revert` back to a demoable state.
6. **Plan first for big moves.** Anything touching more than ~3 files or the data
   model: write a short plan and wait for approval.

## Rules
- Never commit secrets. Real keys live in `.env` (gitignored); add new variable
  *names* to `.env.example` whenever you introduce one.
- Read the real API docs/OpenAPI spec (use the context7 MCP or the URL) before
  calling an external API — don't guess endpoints or params.
- Don't add a dependency without saying why; prefer what's already installed.
- If a fix fails twice, stop and explain what you've learned instead of thrashing.
- Update [docs/STATUS.md](docs/STATUS.md) when a feature lands or a plan changes.

## Gotchas (append a line every time Claude gets something wrong)
- Windows dev machine: shell is PowerShell — use `;` not `&&`, and `$env:VAR` for env vars.
