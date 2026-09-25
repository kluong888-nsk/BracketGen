# Milestone 10 — Edge Cases & Polish

## Depends on
All prior milestones (`01` through `09`) should be complete — this is the
final QA/hardening pass across the whole app.

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. By this point every page and the core algorithm exist and
individually satisfy their own acceptance criteria. This milestone is
about correctness under realistic/awkward inputs and general UI polish —
things easy to skip when building each piece in isolation.

## Scope / Tasks

1. **Multi-round bye fairness**: run a full event (via the real UI, not
   just unit tests) with a roster size that forces byes every round for
   several rounds, and confirm byes visibly rotate fairly across the whole
   event, not just correctly for a single round in isolation.
2. **Team-size edge cases**: team size 1 (every "team" is a single person —
   confirm the algorithm and UI don't break assuming teams always have
   ≥2 members) and a roster that barely clears team size (e.g. team size 6
   with 7 participants).
3. **Exclusion edge cases**: an exclusion pair where satisfying it forces
   an otherwise-suboptimal team split (e.g. small roster, aggressive
   exclusions) — confirm the algorithm still produces valid teams without
   crashing or silently violating the exclusion, even if variety suffers.
4. **All-ties event**: an event where every matchup is scored as a tie —
   confirm the leaderboard and Users tab handle an all-tie record
   correctly (no win/loss, all ties).
5. **Gender-imbalanced rosters**: a roster heavily skewed toward one
   gender — confirm the algorithm doesn't crash trying to "balance" what
   can't be balanced, and does a reasonable best-effort.
6. **Concurrent-edit sanity**: rapidly editing the same matchup's score
   more than once in a row — confirm no duplicate Matchup rows and the
   final value sticks (guards against any race in milestone 6's
   edit-in-place logic).
7. **Styling pass**: consistent layout/spacing across Home, Creation,
   Events (both tabs), Users pages; loading and error states for API
   calls that currently assume happy-path; mobile/narrow-viewport
   sanity check is a nice-to-have, not required (this is a localhost tool,
   likely used on a laptop, per CLAUDE.md's non-goals).
8. **Full end-to-end walkthrough**: create an event, play it through every
   round with a mix of wins/losses/ties, mark it complete, verify the
   read-only view, check the Leaderboard, check the Users tab reflects it
   correctly, delete a *different* unrelated event from Home and confirm
   the first event is untouched.

## Out of scope
- New features not in `CLAUDE.md`/`spec.txt` (e.g. playoff bracket
  generation — explicitly out of scope for this build per CLAUDE.md's
  Non-Goals).
- Auth, deployment/hosting — explicit non-goals.

## Acceptance criteria
- [ ] All scenarios in Scope/Tasks above were actually exercised (via the
      running app, not just imagined) and any bugs found were fixed.
- [ ] The full end-to-end walkthrough (task 8) completes without errors
      and every screen shows correct, mutually-consistent data at the end.
- [ ] No known console errors or obvious visual breakage on the core
      screens (Home, Creation, Events/Matchups, Events/Leaderboard, Users
      list, Users detail).
