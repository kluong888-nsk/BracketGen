# BracketGen Build Milestones

This directory breaks the BracketGen build (see `../CLAUDE.md` and
`../spec.txt` at the repo root) into sequential, independently-runnable
steps. Each `NN-*.md` file is written to be handed to a fresh subagent with
**no other context** — it restates what that subagent needs from the spec,
what prior milestones it can assume are done, and what "done" looks like for
its own step.

## Order & dependencies

Steps are strictly sequential unless noted — each assumes all prior steps
are merged into the working tree:

1. `01-scaffolding-and-schema.md` — project setup, DB schema
2. `02-home-page.md` — event list, create/delete
3. `03-creation-page.md` — event creation form, roster + exclusions
4. `04-roundrobin-algorithm.md` — team/matchup generation (pure logic module)
5. `05-round1-kickoff.md` — wire creation -> generation -> Events Page shell
6. `06-score-entry-and-locking.md` — report results, round locking, next-round trigger
7. `07-leaderboard.md` — per-event leaderboard tab
8. `08-mark-event-complete.md` — manual completion + read-only enforcement
9. `09-users-tab.md` — global cross-event user directory
10. `10-edge-cases-and-polish.md` — uneven rosters, styling, QA pass

Steps 3 and 4 touch disjoint code (form UI vs. pure algorithm) and could in
principle run in parallel, but 3 is sequenced first since 4 is easier to
validate against real seeded rosters produced by 3.

## Running a step with a subagent

Each file is self-contained: point a subagent at it directly, e.g.

> "Read and execute `milestones/04-roundrobin-algorithm.md`. Implement
> everything in its Scope/Tasks section, satisfy its Acceptance Criteria,
> and report back what you built and any deviations."

The subagent should still read `../CLAUDE.md` and `../spec.txt` for full
project context — the milestone file only summarizes what's relevant to
that step, it doesn't replace the source spec.

## Conventions used in every step file

- **Depends on**: which prior milestone files must already be complete.
- **Context**: the minimum spec knowledge needed, inlined so the subagent
  doesn't have to reconstruct it.
- **Scope / Tasks**: what to build.
- **Out of scope**: explicitly deferred to a later step (guards against
  scope creep / duplicated work).
- **Acceptance criteria**: a checklist the subagent should self-verify
  before reporting done.
