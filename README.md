# ACME Senior Living agent experiment

A local demo for comparing senior living sales agents. It includes a prospect website, chat widget, persistent mock requests, and an admin workspace. The stack uses TypeScript, React, Vite, Express, SQLite, OpenAI Agents SDK, and Promptfoo. Use pnpm for package commands.

## Contents

- [Run with Docker](#run-with-docker)
- [Live mode](#live-mode)
- [Agent designs](#agent-designs)
- [Evaluation and monitoring](#evaluation-and-monitoring)
- [Request behavior and assumptions](#request-behavior-and-assumptions)
- [Verification and limits](#verification-and-limits)
- [Local development](#local-development)

## Run with Docker

Requirements: Docker Engine or Docker Desktop with Compose. Ports 3000 and 15500 must be free. No host Node.js installation is needed.

```sh
docker compose --env-file .env.example up --build -d
```

Open http://localhost:3000 for the website, http://localhost:3000/admin for admin, and http://localhost:15500 for Promptfoo. The example configuration uses deterministic fixtures and makes no model calls.

```sh
# Compare all 45 cases across four designs.
docker compose --env-file .env.example run --build --rm evals

# Run offline server tests.
docker compose --env-file .env.example run --build --rm tests

# Stop services and keep their records.
docker compose --env-file .env.example down
```

Fixture quality assertions report **Not scored**. Promptfoo represents them as failures and exits with code 100. This prevents fixture outputs from counting as model-quality evidence. Inspect the separate demo code checks for integration results.

The app and results use named Docker volumes. Restarts and rebuilds keep their data. `docker compose down --volumes` deletes those records. The unauthenticated services bind to loopback and are intended for local use.

## Live mode

Copy `.env.example` to a private configuration file. Set `MODEL_MODE=live` and supply an `OPENAI_API_KEY` before running live calls. Keep credentials outside Git.

```sh
docker compose --env-file /absolute/path/to/private-config up --build -d
docker compose --env-file /absolute/path/to/private-config run --rm --no-deps evals
```

Model access and database writes stay on the server. The app does not load `.env` files itself. Chat, classifier, and reviewer defaults are `gpt-6-luna` with low reasoning. The separate grader uses `gpt-6.1-sol` with medium reasoning. Model and reasoning settings can be changed through the environment variables in `.env.example`. Audits retain these settings. Hosted SDK trace export is disabled. API retries are disabled. Outputs are capped at 2,000 tokens per agent/check call and 6,000 per grader call. Set `API_BUDGET_USD` to enable a persistent local spending guard. It uses conservative token rates and reserves calls before sending them. Its ledger stays in the app data volume. It does not read account credit balances. See [budget behavior](docs/experiment-design.md).

## Agent designs

| Design | Behavior |
| --- | --- |
| Original prompt | Exact instructions in `server/baseline-prompt.ts`, normal chat/tool history, and basic local tools. No added clock, facts, greeting, classifier, review, or server confirmation. |
| Better prompt + server time | Revised prompt, current New York time, and community facts. Same basic tools and normal history. No classifier or reviewer. |
| One agent + checks | Sophie uses focused instructions, an input check, mock tools, and a response reviewer. |
| Sophie + specialists | Sophie calls community and request specialists. The same input, review, and action checks apply. |

All designs use the same underlying community information, tour inventory, contact schema, transaction rules, and duplicate protection. The original receives facts only through its unchanged prompt. The two simple designs share `check_slots` with an absolute date and `save_request`. They manage confirmation in the model. Guarded designs use structured state, relative-date tools, contact-source checks, and server confirmation. Extra agents do not guarantee better results.

Use admin Settings to save the default design. New chats use that choice. Existing chats keep their assignment. The public site has no admin links or experiment controls. Model names and live/fixture mode remain server environment settings.

The baseline prompt is application code. Standalone goals and reference rules are in `server/demo-requirements.ts`. The grader uses those requirements, community facts, displayed replies, and tool evidence. It does not need an external project brief.

## Evaluation and monitoring

The suite has ten reference inputs and 35 generated cases. It includes single questions, request workflows, 8–12 turn conversations, scope recovery, unsupported claims, and instruction attacks. Case G43 adapts published Echo Chamber and Crescendo methods. See [the attack case](docs/jailbreak-case.md).

Primary results measure answer accuracy and factual support. Sales progress and context use remain separate diagnostics. Minor style notes and demo code checks do not change the primary score. A correct final reply cannot erase an earlier error. Grader errors cannot pass. The small visible dataset is not a statistical benchmark.

For the guarded designs, the response path is input validation, scope check, draft and tools, action checks, response review, and display. A rejected draft can receive one correction without tools. The corrected draft must pass another review. Initial and corrected drafts remain in the audit. A completed action is never repeated during correction.

Admin provides transcript timelines, input decisions, both drafts and reviews, tool outcomes, model settings, versions, facts, and timing. Synthetic runs use isolated databases. Saved replies can be regraded without replaying tools. Local databases and ordinary chat records are excluded from Git. Compressed snapshots of the four-design evaluation are included for review. See [restore recorded evaluations](evals/snapshots/README.md).

See [evaluation results](docs/latest-evaluation-report.md), [grading rules](docs/task-evaluation.md), [reference checks](docs/sol-calibration.md), and [design changes](docs/agent-improvements.md).

## Request behavior and assumptions

The scheduling, contact-collection, and confirmation rules below are demo implementation choices. They do not establish additional community policies.

Tours use one-hour weekday starts from 09:00 through 17:00 in America/New_York, covering today and the next 29 calendar days. Past starts are excluded. Revised designs resolve relative dates with the server clock. The original retains its historic date; basic tools do not silently correct it. A weekday name means its next occurrence; on that weekday it means the following week.

Tours require first and last name, email, phone, and an available slot. Callbacks also require a preferred time. Brochures and floor-plan mailing requests also require an address. Ask for missing fields separately. Guarded designs show a server summary and enforce confirmation in code. The better prompt asks the model to obtain confirmation before calling its basic save tool. Basic tools do not enforce confirmation or contact provenance. Changed details require a fresh summary in the revised designs.

Booking rechecks availability in a transaction. A unique slot constraint prevents competing bookings. Request IDs make retries idempotent. A saved record remains saved if response review later fails. Tools only save local records: no staff contact, real booking, or material delivery occurs.

Unknown information stays unknown. This includes room-specific prices, dementia-care suitability, individual temperature controls, Kosher meals, and pet exceptions. The supplied lease term has no unit. No vector database is needed for this small fact set.

## Verification and limits

The current four-design run completed 180 combinations: original 19/45, better prompt 44/45, checks 42/45, and specialists 41/45 primary passes. Two specialist runs had pipeline errors. The local budget ledger recorded a conservative $6.69 estimate. See [the evaluation report](docs/latest-evaluation-report.md). Baseline failures mostly reflect scripted voicemail claims and stale dates, not invented community facts.

Offline verification includes 93 server tests, Antfu lint, a TypeScript/Vite production build, and seven browser checks. Models and graders remain fallible. The project omits authentication, real staff integrations, deployment, voice, hosted monitoring, and evaluation-case editing. Browser checks use Chrome on the host. Other CPU architectures were not tested.

## Local development

Use Node.js 24+ and pnpm 12.10.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm test:browser
```

Browser tests start an isolated fixture server on port 3100 with a temporary database. They make no model calls. Docker builds run lint, server tests, and the production build. The project uses `@antfu/eslint-config` with TypeScript and React rules. Run `pnpm lint:fix` to apply formatting fixes.
