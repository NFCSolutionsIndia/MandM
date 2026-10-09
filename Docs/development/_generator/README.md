# Plan generator — FROZEN, do not run

This is the one-shot tool that bootstrapped the 240 planning documents under
`Docs/development/` from `data/p01.js` … `p12.js`.

**It has been superseded by the documents it produced. Running it would destroy
work.** It is kept for provenance — so the plan's origin is auditable — not as a
live tool.

## What running it would destroy

| Lost | Because |
|---|---|
| **The entire AWS stack change** | `data/*.js` still describes Neon, Vercel and Fly.io. Regenerating reverts ~135 documents to the superseded hosting. |
| **Every task's completion status** | The data files hard-code `pending`. TASK-001 is `completed`. |
| **Every §20 implementation note** | Acceptance-criteria verification, decisions taken, blockers hit — all recorded by hand after generation. |
| **Seven hand-rewritten task documents** | TASK-006, 008, 009, 017, 039, 062, 093 were rewritten in prose the data files do not contain. |

A guard in `generate.js` refuses to run without an explicit acknowledgement flag.
The guard is the point; do not remove it to "make the tool work again".

## The `.md` files are the source of truth

Task status, implementation notes and acceptance verification are recorded in the
generated documents by hand as work proceeds. That is the intended workflow — see
`CONVENTIONS.md` under *Status vocabulary*. The data files are a historical
snapshot of the plan at creation, nothing more.

## If the plan ever needs regenerating wholesale

Don't, unless you are restructuring the entire plan. If you truly must:

1. Port every hand-written change back into `data/*.js` first — the stack change,
   the statuses, the notes, the seven rewrites.
2. Diff the generated output against the committed documents and reconcile every
   difference before overwriting anything.
3. Commit the regeneration separately from any content change, so the diff is
   reviewable.

Step 1 is most of a day's work. Editing the `.md` files directly is almost always
the right answer.

## Why `package.json` exists here

It declares `"type": "commonjs"`. The repository root sets `"type": "module"`
(TASK-001), which would otherwise make this tool's `require()` calls fail.
