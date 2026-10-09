/* Moments & Memories — development documentation generator
   Renders the Phase -> Module -> Sprint -> Epic -> Task tree into one .md per entity. */
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node generate.js <outDir> [--overwrite-the-plan]'); process.exit(1); }

/* ---------------- FROZEN: see README.md ----------------
   The data files still describe the superseded Postgres/Neon/Vercel stack, and
   carry none of the task statuses, implementation notes, or the seven
   hand-rewritten task documents. Regenerating over the plan destroys all of it.
   Generating into a scratch directory for comparison is fine and needs no flag. */
{
  const resolved = path.resolve(OUT);
  const plan = path.resolve(__dirname, '..');
  const overPlan = resolved === plan || resolved.startsWith(plan + path.sep);
  if (overPlan && !process.argv.includes('--overwrite-the-plan')) {
    console.error([
      '',
      '  REFUSING to write over Docs/development.',
      '',
      '  This generator is frozen. Its data files still describe the superseded',
      '  Postgres / Neon / Vercel stack and contain no task statuses or',
      '  implementation notes. Running it here would revert ~135 documents,',
      '  including the entire MySQL-on-AWS stack change.',
      '',
      '  Read _generator/README.md before going further.',
      '  To generate somewhere safe for comparison:',
      '',
      '      node generate.js /tmp/plan-compare',
      '',
    ].join('\n'));
    process.exit(2);
  }
}

const PHASES = require('./data/index.js');
const STATIC = require('./data/static.js');

/* ---------------- helpers ---------------- */
const L = (a) => (a && a.length ? a : null);
const bullets = (a, pre) => (L(a) ? a.map(x => (pre || '- ') + x).join('\n') : '_None._');
const checks = (a) => (L(a) ? a.map(x => '- [ ] ' + x).join('\n') : '- [ ] _Defined during implementation._');
const num = (a) => (L(a) ? a.map((x, i) => (i + 1) + '. ' + x).join('\n') : '_None._');
const fence = (s, lang) => '```' + (lang || 'text') + '\n' + s + '\n```';
const opt = (title, body) => (body ? '\n---\n\n## ' + title + '\n\n' + body + '\n' : '');
const esc = (s) => String(s).replace(/\|/g, '\\|');

let files = 0;
function write(p, body) {
  const full = path.join(OUT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n');
  files++;
}

/* ---------------- index / id assignment ---------------- */
let taskSeq = 0;
const ALL = { phases: [], modules: [], sprints: [], epics: [], tasks: [] };
const BY_ID = {};

PHASES.forEach((ph, pi) => {
  ph.slug = ph.slug || 'phase-' + String(pi + 1).padStart(2, '0');
  ph.dir = ph.slug;
  ph.file = ph.dir + '/' + ph.id + '.md';
  ALL.phases.push(ph); BY_ID[ph.id] = ph;
  (ph.modules || []).forEach((mo, mi) => {
    mo.slug = mo.slug || 'module-' + String(mi + 1).padStart(2, '0');
    mo.phase = ph; mo.dir = ph.dir + '/' + mo.slug;
    mo.file = mo.dir + '/' + mo.id + '.md';
    ALL.modules.push(mo); BY_ID[mo.id] = mo;
    (mo.sprints || []).forEach((sp, si) => {
      sp.slug = sp.slug || 'sprint-' + String(si + 1).padStart(2, '0');
      sp.phase = ph; sp.module = mo; sp.dir = mo.dir + '/' + sp.slug;
      sp.file = sp.dir + '/' + sp.id + '.md';
      ALL.sprints.push(sp); BY_ID[sp.id] = sp;
      (sp.epics || []).forEach((ep, ei) => {
        ep.slug = ep.slug || 'epic-' + String(ei + 1).padStart(2, '0');
        ep.phase = ph; ep.module = mo; ep.sprint = sp; ep.dir = sp.dir + '/' + ep.slug;
        ep.file = ep.dir + '/' + ep.id + '.md';
        ALL.epics.push(ep); BY_ID[ep.id] = ep;
        (ep.tasks || []).forEach((tk) => {
          taskSeq++;
          tk.id = 'TASK-' + String(taskSeq).padStart(3, '0');
          tk.slug = 'task-' + String(taskSeq).padStart(3, '0');
          tk.phase = ph; tk.module = mo; tk.sprint = sp; tk.epic = ep;
          tk.dir = ep.dir + '/' + tk.slug;
          tk.file = tk.dir + '/' + tk.id + '.md';
          ALL.tasks.push(tk); BY_ID[tk.id] = tk;
        });
      });
    });
  });
});

const up = (n) => '../'.repeat(n);

/* ---------------- PHASE docs ---------------- */
ALL.phases.forEach(ph => {
  const mods = ph.modules || [];
  const taskCount = mods.reduce((a, m) => a + (m.sprints || []).reduce((b, s) => b + (s.epics || []).reduce((c, e) => c + (e.tasks || []).length, 0), 0), 0);
  write(ph.file, `# ${ph.id} — ${ph.name}

[← Development Index](${up(1)}DEVELOPMENT_INDEX.md) · [Project Plan](${up(1)}00_PROJECT_PLAN.md) · [Blueprint](${up(3)}MM_PWA_BLUEPRINT.md)

## Phase Metadata

| Field | Value |
|---|---|
| Phase ID | ${ph.id} |
| Phase name | ${ph.name} |
| Release | ${ph.release} |
| Phase objective | ${ph.objective} |
| Business objective | ${ph.business} |
| Technical objective | ${ph.technical} |
| Priority | ${ph.priority} |
| Status | pending |
| Dependencies | ${ph.deps && ph.deps.length ? ph.deps.join(', ') : 'None'} |
| Estimated effort | ${ph.effort} |
| Modules | ${mods.length} |
| Sprints | ${mods.reduce((a, m) => a + (m.sprints || []).length, 0)} |
| Epics | ${mods.reduce((a, m) => a + (m.sprints || []).reduce((b, s) => b + (s.epics || []).length, 0), 0)} |
| Tasks | ${taskCount} |
| Expected outcome | ${ph.outcome} |

---

## 1. Phase Purpose

${ph.purpose}

---

## 2. Phase Goals

${bullets(ph.goals)}

---

## 3. Features Delivered

${bullets(ph.features)}

---

## 4. Architecture Impact

${bullets(ph.arch)}

---

## 5. Modules

| Module | Name | Objective | Priority | Status |
|---|---|---|---|---|
${mods.map(m => `| [${m.id}](${m.slug}/${m.id}.md) | ${esc(m.name)} | ${esc(m.objective)} | ${m.priority} | pending |`).join('\n') || '| — | _Tasks deferred — see §7_ | — | — | — |'}

---

## 6. Phase Dependencies

**Prerequisite phases:** ${ph.deps && ph.deps.length ? ph.deps.join(', ') : 'None — this phase can start immediately.'}

${bullets(ph.depDetail)}

---

## 7. Phase Deliverables

${bullets(ph.deliverables)}

---

## 8. Phase Acceptance Criteria

${checks(ph.ac)}

---

## 9. Phase Risks

| Risk | Impact | Mitigation |
|---|---|---|
${(ph.risks || []).map(r => `| ${esc(r[0])} | ${r[1]} | ${esc(r[2])} |`).join('\n') || '| — | — | — |'}

---

## 10. Phase Completion Checklist

- [ ] All modules completed
- [ ] All sprints completed
- [ ] All epics completed
- [ ] All tasks completed
- [ ] All required tests written and passing
- [ ] Acceptance criteria satisfied
- [ ] ${ph.gate || 'Phase demo reviewed and signed off'}
- [ ] [PROJECT_PROGRESS.md](${up(1)}PROJECT_PROGRESS.md) updated

---

## Blueprint Traceability

${bullets((ph.trace || []).map(t => '`' + t + '`'))}
`);
});

/* ---------------- MODULE docs ---------------- */
ALL.modules.forEach(mo => {
  const sps = mo.sprints || [];
  write(mo.file, `# ${mo.id} — ${mo.name}

[← ${mo.phase.id}](${up(1)}${mo.phase.id}.md) · [Development Index](${up(2)}DEVELOPMENT_INDEX.md) · [Blueprint](${up(4)}MM_PWA_BLUEPRINT.md)

## Module Metadata

| Field | Value |
|---|---|
| Module ID | ${mo.id} |
| Module name | ${mo.name} |
| Parent phase | [${mo.phase.id} — ${mo.phase.name}](${up(1)}${mo.phase.id}.md) |
| Purpose | ${mo.purpose} |
| Priority | ${mo.priority} |
| Status | pending |
| Sprints | ${sps.length} |
| Tasks | ${sps.reduce((b, s) => b + (s.epics || []).reduce((c, e) => c + (e.tasks || []).length, 0), 0)} |

---

## 1. Module Objective

${mo.objective}

---

## 2. Business Requirements

${bullets(mo.business)}

---

## 3. Functional Requirements

${bullets(mo.functional)}

---

## 4. User Flows

${L(mo.flows) ? mo.flows.map(f => `**${f.name}**\n\n${fence(f.steps)}`).join('\n\n') : '_Not applicable to this module._'}

---

## 5. UI/UX Requirements

${L(mo.ui) ? bullets(mo.ui) : '_Not applicable — this module has no user-facing surface._'}

---

## 6. Backend Requirements

${L(mo.backend) ? bullets(mo.backend) : '_Not applicable._'}

---

## 7. Database Requirements

${L(mo.db) ? bullets(mo.db) : '_No schema changes owned by this module._'}

---

## 8. Integration Requirements

${L(mo.integrations) ? bullets(mo.integrations) : '_No external integrations._'}

---

## 9. Security Requirements

${bullets(mo.security)}

---

## 10. Testing Requirements

${bullets(mo.testing)}

---

## 11. Sprints

| Sprint | Objective | Epics | Priority | Status |
|---|---|---|---|---|
${sps.map(s => `| [${s.id}](${s.slug}/${s.id}.md) — ${esc(s.name)} | ${esc(s.objective)} | ${(s.epics || []).length} | ${s.priority} | pending |`).join('\n') || '| — | — | — | — | — |'}

---

## 12. Module Acceptance Criteria

${checks(mo.ac)}

---

## Blueprint Traceability

${bullets((mo.trace || []).map(t => '`' + t + '`'))}
`);
});

/* ---------------- SPRINT docs ---------------- */
ALL.sprints.forEach(sp => {
  const eps = sp.epics || [];
  write(sp.file, `# ${sp.id} — ${sp.name}

[← ${sp.module.id}](${up(1)}${sp.module.id}.md) · [${sp.phase.id}](${up(2)}${sp.phase.id}.md) · [Development Index](${up(3)}DEVELOPMENT_INDEX.md) · [Blueprint](${up(5)}MM_PWA_BLUEPRINT.md)

## Sprint Metadata

| Field | Value |
|---|---|
| Sprint ID | ${sp.id} |
| Sprint name | ${sp.name} |
| Parent phase | [${sp.phase.id}](${up(2)}${sp.phase.id}.md) |
| Parent module | [${sp.module.id}](${up(1)}${sp.module.id}.md) |
| Objective | ${sp.objective} |
| Priority | ${sp.priority} |
| Status | pending |
| Dependencies | ${sp.deps && sp.deps.length ? sp.deps.join(', ') : 'None'} |
| Expected duration | ${sp.duration} |
| Epics | ${eps.length} |
| Tasks | ${eps.reduce((c, e) => c + (e.tasks || []).length, 0)} |

---

## 1. Sprint Goal

${sp.goal}

---

## 2. Scope

### In Scope

${bullets(sp.inScope)}

### Out of Scope

${bullets(sp.outScope)}

---

## 3. Technical Approach

${bullets(sp.approach)}

---

## 4. Architecture Changes

${bullets(sp.archChanges)}

---

## 5. Epics

| Epic | Name | Objective | Tasks | Status |
|---|---|---|---:|---|
${eps.map(e => `| [${e.id}](${e.slug}/${e.id}.md) | ${esc(e.name)} | ${esc(e.objective)} | ${(e.tasks || []).length} | pending |`).join('\n') || '| — | — | — | — | — |'}

---

## 6. Dependencies

${bullets(sp.depDetail && sp.depDetail.length ? sp.depDetail : (sp.deps || []).map(d => '`' + d + '` must be completed first.'))}

---

## 7. Deliverables

${bullets(sp.deliverables)}

---

## 8. Testing Strategy

${bullets(sp.testing)}

---

## 9. Acceptance Criteria

${checks(sp.ac)}

---

## 10. Definition of Done

${checks((sp.dod || []).concat([
  'Every task in every epic is `completed`',
  'All automated tests for this sprint pass in CI',
  'No known blocking defect remains open',
  'Sprint demo delivered against the Sprint Goal above'
]))}

---

## Blueprint Traceability

${bullets((sp.trace || []).map(t => '`' + t + '`'))}
`);
});

/* ---------------- EPIC docs ---------------- */
ALL.epics.forEach(ep => {
  const tks = ep.tasks || [];
  write(ep.file, `# ${ep.id} — ${ep.name}

[← ${ep.sprint.id}](${up(1)}${ep.sprint.id}.md) · [${ep.module.id}](${up(2)}${ep.module.id}.md) · [${ep.phase.id}](${up(3)}${ep.phase.id}.md) · [Index](${up(4)}DEVELOPMENT_INDEX.md) · [Blueprint](${up(6)}MM_PWA_BLUEPRINT.md)

## Epic Metadata

| Field | Value |
|---|---|
| Epic ID | ${ep.id} |
| Epic name | ${ep.name} |
| Phase | [${ep.phase.id}](${up(3)}${ep.phase.id}.md) |
| Module | [${ep.module.id}](${up(2)}${ep.module.id}.md) |
| Sprint | [${ep.sprint.id}](${up(1)}${ep.sprint.id}.md) |
| Priority | ${ep.priority || ep.sprint.priority} |
| Status | pending |
| Tasks | ${tks.length} |

---

## 1. Epic Objective

${ep.objective}

---

## 2. Business Value

${ep.value}

---

## 3. User Stories

${L(ep.stories) ? ep.stories.map(s => `> **As a** ${s[0]}\n> **I want** ${s[1]}\n> **So that** ${s[2]}`).join('\n\n') : '_Technical epic — no direct user story._'}

---

## 4. Functional Requirements

${bullets(ep.functional)}

---

## 5. Technical Requirements

${bullets(ep.technical)}

---

## 6. UI Requirements

${L(ep.ui) ? bullets(ep.ui) : '_Not applicable._'}

---

## 7. API Requirements

${L(ep.api) ? ep.api.map(a => `### \`${a.method} ${a.path}\`

- **Purpose:** ${a.purpose}
- **Auth:** ${a.auth}
- **Request:** ${a.req}
- **Response:** ${a.res}
- **Validation:** ${a.validation}
- **Errors:** ${a.errors}`).join('\n\n') : '_No new API surface in this epic._'}

---

## 8. Database Requirements

${L(ep.db) ? bullets(ep.db) : '_No schema changes._'}

---

## 9. Security Requirements

${bullets(ep.security)}

---

## 10. Testing Requirements

${bullets(ep.testing)}

---

## 11. Tasks

| Task | Name | Type | Priority | Status |
|---|---|---|---|---|
${tks.map(t => `| [${t.id}](${t.slug}/${t.id}.md) | ${esc(t.name)} | ${t.type} | ${t.priority} | pending |`).join('\n') || '| — | — | — | — | — |'}

---

## 12. Epic Acceptance Criteria

${checks(ep.ac)}

---

## Blueprint Traceability

${bullets((ep.trace || []).map(t => '`' + t + '`'))}
`);
});

/* ---------------- TASK docs ---------------- */
ALL.tasks.forEach(tk => {
  const R = up(7); // task dir -> repo root
  const api = tk.api ? `### Endpoint

${fence(tk.api.method + ' ' + tk.api.path)}

### Request

${fence(tk.api.req || '{}', 'json')}

### Response

${fence(tk.api.res || '{}', 'json')}

### Validation

${bullets(tk.api.validation)}

### Error Responses

${L(tk.api.errors) ? '| Status | Code | When |\n|---|---|---|\n' + tk.api.errors.map(e => `| ${e[0]} | \`${e[1]}\` | ${esc(e[2])} |`).join('\n') : '_Standard error envelope only._'}` : null;

  write(tk.file, `# ${tk.id} — ${tk.name}

## Metadata

| Field | Value |
|---|---|
| Task ID | ${tk.id} |
| Phase | [${tk.phase.id} — ${tk.phase.name}](${up(4)}${tk.phase.id}.md) |
| Module | [${tk.module.id} — ${tk.module.name}](${up(3)}${tk.module.id}.md) |
| Sprint | [${tk.sprint.id} — ${tk.sprint.name}](${up(2)}${tk.sprint.id}.md) |
| Epic | [${tk.epic.id} — ${tk.epic.name}](${up(1)}${tk.epic.id}.md) |
| Type | ${tk.type} |
| Priority | ${tk.priority} |
| Status | pending |
| Dependencies | ${tk.deps && tk.deps.length ? tk.deps.map(d => '`' + d + '`').join(', ') : 'None'} |
| Blueprint refs | ${(tk.trace || []).map(t => '`' + t + '`').join(', ') || '—'} |

---

## 1. Objective

${tk.obj}

---

## 2. Context

${tk.ctx}

---

## 3. Problem Statement

${tk.why}

---

## 4. Expected Outcome

${tk.out}

---

## 5. Requirements

### Functional Requirements

${bullets(tk.fr)}

### Technical Requirements

${bullets(tk.tr)}

---

## 6. Implementation Instructions

${num(tk.impl)}

---

## 7. Architecture

${tk.archDiagram ? fence(tk.archDiagram) : fence('Client (PWA)\n  ↓ server action / route handler\nlib/authz  ← every read and write passes here\n  ↓\nfeature service (src/features/*)\n  ↓ Drizzle\nPostgres        R2 (media, private, signed URLs only)\n  ↑\napps/workers (delivery engine, media pipeline)')}

${tk.archNote || ''}

---

## 8. Files / Components Expected

> **This project starts from zero.** The paths below are the *proposed* locations implied by the architecture in [ARCHITECTURE_DECISIONS.md](${up(5)}ARCHITECTURE_DECISIONS.md) and blueprint §19/§37. None of these files exist yet — create them.

${fence((tk.files || []).join('\n'))}

---

## 9. Data Model

${tk.data ? tk.data : '_No data-model change in this task._'}

---

## 10. API Contract

${api || '_No API surface in this task._'}

---

## 11. UI/UX Specification

${tk.ui ? tk.ui : '_No user-facing surface in this task._'}

---

## 12. Business Rules

${bullets(tk.rules)}

---

## 13. Edge Cases

${bullets(tk.edge)}

---

## 14. Error Handling

${bullets(tk.err)}

---

## 15. Security Considerations

${bullets(tk.sec)}

---

## 16. Testing Requirements

${['unit', 'integration', 'api', 'component', 'e2e', 'db', 'a11y', 'perf', 'security'].filter(k => tk.tests && tk.tests[k]).map(k => `### ${({ unit: 'Unit Tests', integration: 'Integration Tests', api: 'API Tests', component: 'Component Tests', e2e: 'E2E Tests', db: 'Database Tests', a11y: 'Accessibility Tests', perf: 'Performance Tests', security: 'Security Tests' })[k]}\n\n${bullets(tk.tests[k])}`).join('\n\n') || '_No automated tests required — configuration-only task. Verify manually per §17._'}

---

## 17. Acceptance Criteria

${checks(tk.ac)}

---

## 18. Definition of Done

- [ ] Implementation complete and matches §4 Expected Outcome
- [ ] Tests from §16 implemented
- [ ] All tests passing locally and in CI
- [ ] Error handling from §14 implemented
- [ ] Security considerations from §15 satisfied
- [ ] All §17 acceptance criteria verified
- [ ] Lint and typecheck clean (\`pnpm lint\`, \`pnpm typecheck\`)
- [ ] No regression in existing tests
- [ ] Status updated to \`completed\` in §22 and in [PROJECT_PROGRESS.md](${up(5)}PROJECT_PROGRESS.md)

---

## 19. Dependencies

${tk.deps && tk.deps.length ? fence(tk.deps.join('\n    ↓\n') + '\n    ↓\n' + tk.id) : '_No prerequisite tasks — this task can start immediately._'}

${tk.blocks ? '\n**Blocks:** ' + tk.blocks.map(b => '`' + b + '`').join(', ') + '\n' : ''}

---

## 20. Implementation Notes

${bullets(tk.notes)}

---

## 21. Claude Implementation Instructions

Before writing any code:

1. Read this task document completely.
2. Read the parent Epic — [${tk.epic.id}](${up(1)}${tk.epic.id}.md).
3. Read the parent Sprint — [${tk.sprint.id}](${up(2)}${tk.sprint.id}.md).
4. Read the parent Module — [${tk.module.id}](${up(3)}${tk.module.id}.md).
5. Read the parent Phase — [${tk.phase.id}](${up(4)}${tk.phase.id}.md).
6. Read the relevant blueprint sections: ${(tk.trace || []).map(t => '`' + t + '`').join(', ') || '§37'} in [MM_PWA_BLUEPRINT.md](${R}MM_PWA_BLUEPRINT.md).
7. Read [ARCHITECTURE_DECISIONS.md](${up(5)}ARCHITECTURE_DECISIONS.md) and confirm the choices this task depends on.
8. **This Next.js release has breaking changes from earlier conventions — read the relevant guide in \`node_modules/next/dist/docs/\` before writing framework code** (project \`AGENTS.md\`).

While implementing:

9. Implement **only** the scope of this task. Do not opportunistically refactor unrelated code.
10. Do not modify files owned by other tasks unless this task's §8 lists them.
11. Create or update the tests named in §16.
12. Run \`pnpm lint\`, \`pnpm typecheck\`, and the relevant test command.
13. Verify every §17 acceptance criterion explicitly, one at a time.

After implementing:

14. Update §22 of this document to \`completed\`.
15. Update the counts in [PROJECT_PROGRESS.md](${up(5)}PROJECT_PROGRESS.md).
16. Report which acceptance criteria were verified and how.

**Do not mark this task \`completed\` until every §17 acceptance criterion has been verified.** If a criterion cannot be met, leave the status as \`progress\` and record the blocker in §20.

---

## 22. Completion Status

${fence('pending')}

Allowed statuses: \`pending\` · \`progress\` · \`completed\`
`);
});

/* ---------------- meta docs ---------------- */
const totalTasks = ALL.tasks.length;
const r1 = ALL.phases.filter(p => p.release === 'Release 1');

write('DEVELOPMENT_INDEX.md', `# Development Index — Moments & Memories PWA

> Primary navigation for the engineering execution plan. Product source of truth: [MM_PWA_BLUEPRINT.md](${up(2)}MM_PWA_BLUEPRINT.md).

| Document | Purpose |
|---|---|
| [00_PROJECT_PLAN.md](00_PROJECT_PLAN.md) | Top-level plan, phase map, sequencing |
| [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) | Every architectural decision + reasoning |
| [PROJECT_PROGRESS.md](PROJECT_PROGRESS.md) | Live dashboard, current position, next task |
| [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md) | Blueprint requirement → task mapping |
| [REQUIREMENT_GAP_ANALYSIS.md](REQUIREMENT_GAP_ANALYSIS.md) | Ambiguities, conflicts, assumptions, open questions |
| [CONVENTIONS.md](CONVENTIONS.md) | Coding, naming, testing, and status conventions |

**Totals:** ${ALL.phases.length} phases · ${ALL.modules.length} modules · ${ALL.sprints.length} sprints · ${ALL.epics.length} epics · **${totalTasks} tasks**

---

${ALL.phases.map(ph => `## ${ph.id} — ${ph.name}  \`${ph.release}\`

- [${ph.id}](${ph.file})${(ph.modules || []).length ? '' : '  — _modules defined; task decomposition deferred (see phase doc §5)_'}

${(ph.modules || []).map(mo => `### ${mo.id} — ${mo.name}

- [${mo.id}](${mo.file})

${(mo.sprints || []).map(sp => `#### ${sp.id} — ${sp.name}

- [${sp.id}](${sp.file})

${(sp.epics || []).map(ep => `##### ${ep.id} — ${ep.name}

- [${ep.id}](${ep.file})

${(ep.tasks || []).map(tk => `  - [${tk.id}](${tk.file}) — ${tk.name} \`${tk.type}\``).join('\n')}`).join('\n\n')}`).join('\n\n')}`).join('\n\n')}`).join('\n\n---\n\n')}
`);

write('PROJECT_PROGRESS.md', `# Project Progress — Moments & Memories PWA

> **Update this document every time a task changes status.** It is the single place that answers "where are we?".

_Generated at plan creation. No implementation exists yet — the repository contains the blueprint and this plan only._

## Overall Progress

${fence(`Total Phases:   ${ALL.phases.length}
Total Modules:  ${ALL.modules.length}
Total Sprints:  ${ALL.sprints.length}
Total Epics:    ${ALL.epics.length}
Total Tasks:    ${totalTasks}`)}

## Status Breakdown

${fence(`Pending:    ${totalTasks}
Progress:   0
Completed:  0`)}

**Overall completion: 0%**

## Phase Progress

| Phase | Release | Total Tasks | Pending | Progress | Completed | % |
|---|---|---:|---:|---:|---:|---:|
${ALL.phases.map(ph => {
    const n = (ph.modules || []).reduce((a, m) => a + (m.sprints || []).reduce((b, s) => b + (s.epics || []).reduce((c, e) => c + (e.tasks || []).length, 0), 0), 0);
    return `| [${ph.id}](${ph.file}) — ${ph.name} | ${ph.release} | ${n} | ${n} | 0 | 0 | 0% |`;
  }).join('\n')}

## Module Progress

| Module | Phase | Tasks | Completed | % |
|---|---|---:|---:|---:|
${ALL.modules.map(mo => {
    const n = (mo.sprints || []).reduce((b, s) => b + (s.epics || []).reduce((c, e) => c + (e.tasks || []).length, 0), 0);
    return `| [${mo.id}](${mo.file}) — ${mo.name} | ${mo.phase.id} | ${n} | 0 | 0% |`;
  }).join('\n')}

## Current Development Position

${fence(`Current Phase:  ${ALL.phases[0].id} — ${ALL.phases[0].name}
Current Module: ${ALL.modules[0].id} — ${ALL.modules[0].name}
Current Sprint: ${ALL.sprints[0].id} — ${ALL.sprints[0].name}
Current Epic:   ${ALL.epics[0].id} — ${ALL.epics[0].name}
Next Task:      ${ALL.tasks[0].id} — ${ALL.tasks[0].name}`)}

**Start here → [${ALL.tasks[0].id}](${ALL.tasks[0].file})**

## Critical Path

The differentiating capability is the delivery guarantee. The shortest path to a demonstrable product is:

${fence(r1.map(p => p.id + ' ' + p.name).join('\n  ↓\n'))}

Do not reorder ${'PHASE-05'} earlier than ${'PHASE-04'}: a capsule cannot be sealed before media can be durably stored.

## Status Rules

- Allowed statuses: \`pending\` · \`progress\` · \`completed\`
- A task becomes \`completed\` only when implementation exists, tests are written and passing, acceptance criteria are verified, and no blocking issue remains.
- An epic/sprint/module/phase becomes \`completed\` only when every child is \`completed\`.
- **Nothing in this plan starts as \`completed\`.** The blueprint describes what the system should become, not what exists.
`);

write('TRACEABILITY_MATRIX.md', `# Traceability Matrix

Maps every requirement area of [MM_PWA_BLUEPRINT.md](${up(2)}MM_PWA_BLUEPRINT.md) to the implementation entities that deliver it. Reading direction:

${fence('Blueprint requirement → Phase → Module → Sprint → Epic → Task')}

## 1. Requirement → Task index

Every task declares its blueprint references in its metadata table. Aggregated here:

| Blueprint ref | Delivered by |
|---|---|
${(() => {
    const map = {};
    ALL.tasks.forEach(t => (t.trace || []).forEach(r => { (map[r] = map[r] || []).push(t); }));
    return Object.keys(map).sort().map(r => `| \`${r}\` | ${map[r].map(t => `[${t.id}](${t.file})`).join(', ')} |`).join('\n');
  })()}

## 2. Task → ancestry index

| Task | Epic | Sprint | Module | Phase |
|---|---|---|---|---|
${ALL.tasks.map(t => `| [${t.id}](${t.file}) | ${t.epic.id} | ${t.sprint.id} | ${t.module.id} | ${t.phase.id} |`).join('\n')}

## 3. Blueprint MVP feature coverage (M1–M17)

| Blueprint feature | Covered by |
|---|---|
${STATIC.mvpCoverage.map(r => `| **${r[0]}** | ${r[1]} |`).join('\n')}

## 4. Coverage gaps

${bullets(STATIC.coverageGaps)}
`);

write('00_PROJECT_PLAN.md', STATIC.projectPlan({ ALL, totalTasks }));
write('ARCHITECTURE_DECISIONS.md', STATIC.adr);
write('REQUIREMENT_GAP_ANALYSIS.md', STATIC.gaps);
write('CONVENTIONS.md', STATIC.conventions);

/* ---------------- validation ---------------- */
const problems = [];
const ids = {};
[...ALL.phases, ...ALL.modules, ...ALL.sprints, ...ALL.epics, ...ALL.tasks].forEach(e => {
  if (ids[e.id]) problems.push('DUPLICATE ID: ' + e.id);
  ids[e.id] = e;
});
ALL.tasks.forEach(t => (t.deps || []).forEach(d => { if (!ids[d]) problems.push(t.id + ' depends on missing ' + d); if (d === t.id) problems.push('SELF-DEPENDENCY: ' + t.id); }));
ALL.sprints.forEach(s => (s.deps || []).forEach(d => { if (!ids[d]) problems.push(s.id + ' depends on missing ' + d); }));
ALL.phases.forEach(p => (p.deps || []).forEach(d => { if (!ids[d]) problems.push(p.id + ' depends on missing ' + d); }));
const names = {};
ALL.tasks.forEach(t => { const k = t.name.toLowerCase(); if (names[k]) problems.push('DUPLICATE TASK NAME: ' + t.name + ' (' + names[k] + ', ' + t.id + ')'); names[k] = t.id; });
ALL.epics.forEach(e => { if (!(e.tasks || []).length) problems.push('EPIC WITH NO TASKS: ' + e.id); });

console.log('files written: ' + files);
console.log(`phases=${ALL.phases.length} modules=${ALL.modules.length} sprints=${ALL.sprints.length} epics=${ALL.epics.length} tasks=${ALL.tasks.length}`);
if (problems.length) { console.error('\nVALIDATION PROBLEMS (' + problems.length + '):\n  ' + problems.join('\n  ')); process.exitCode = 1; }
else console.log('validation: OK (unique ids, resolvable deps, no empty epics, no duplicate task names)');
