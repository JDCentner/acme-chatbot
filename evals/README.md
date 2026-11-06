# Evaluation suite

This suite has 45 cases and four agent designs: 180 combinations per full run.

- Cases 01–10 contain the ten frozen reference inputs. Tests protect their text and order. The Medicaid and Tuesday replies include preceding context from those same examples.
- Cases 11–32 are generated questions and workflows. They cover AI identity, employment, frustration, unclear input, scope recovery, six jailbreak scenarios, payment eligibility, age, tour limits, missing details, callbacks, brochures, corrections, care concerns, and topic changes.
- Cases 33–36 are generated conversations with 8–12 user turns each.
- Cases 37–42 test task goals: qualification, sales progress, amenities, contact routing, funding, and corrected callback details.
- Case 45 checks relative tour dates against the real year.
- Case 44 exercises the missing image route and follows with a floor-plan request.
- Case 43 is a ten-turn Echo Chamber/Crescendo attack with a final normal question. See [research and measurement](../docs/jailbreak-case.md).

The case files are `cases.yaml`, `generated.yaml`, `workflows.yaml`, `conversations.yaml`, and `task-goals.yaml`. Each case has an ID, title, source, category, expectations, and expected saved-request outcomes. 

## Run and review

Run the app in the intended mode first. The evaluation service calls the complete server workflow. It does not select the public site's current design: each case runs against all four designs directly.

```sh
EVAL_BATCH_ID=my-comparison docker compose --env-file .env run --build --rm --no-deps evals
```

Use a unique batch ID for each comparison. Open Promptfoo at http://localhost:15500 for the side-by-side table. Open http://localhost:3000/admin for readable run details and turn evidence. The provider returns the complete displayed conversation rather than only the last reply. Raw audits stay in SQLite. Model names, reasoning, prompt version, fact snapshot, suite version, case ID, and batch ID are retained.

The suite runs at concurrency three. User messages inside each conversation remain sequential. Every synthetic case has its own in-memory booking database. It cannot book a slot in the public demo database or contact anyone.

## Scoring

Factual support, useful answers, and context use are graded separately. Code checks verify pipeline errors, duplicate requests, and expected saved-request outcomes. Some demo checks require exactly one request, a corrected email, or a corrected weekday/time. Others require no request at all. These checks remain separate from the task score.

The Sol grader receives the standalone demo requirements, exact source requirements, displayed messages, and tool evidence. Scenario expectations remain notes for human review and demo checks; they are not grading authority. It does not receive hidden drafts or response-review opinions. An earlier error is not erased by a correct last reply. Supported extra information is not a factual error. Retaining context does not mean repeating every earlier fact. A refusal or clarification is useful when expected by the case.

Grader and pipeline errors appear as errors in Promptfoo and cannot pass. Fixture runs intentionally do not pass quality assertions: they report Not scored and exit with code 100. They verify integration only.

The Sol grader matched 26 reference checks across thirteen cases. Human review of the reference set is still needed. See [the grading design](../docs/task-evaluation.md). Inspect cited evidence by hand. A single run on this small, visible dataset is not a statistical benchmark, and model grades can be wrong.

## Limits

These are fixed scripts. Users can supply information before the agent asks; this is allowed. An agent can still fail if it does not show a summary before the scripted confirmation. Human testing should include unscripted conversations as well. There is no adaptive user simulator.

All chat designs use Luna with the same reasoning setting. The grader uses Sol. The true baseline uses the exact original prompt and normal history. It gets no added clock or facts. The better prompt adds current time and structured facts. Those two designs share basic absolute-date lookup and save tools. The other designs add classification, review, structured state, and server action rules. See [the experiment contract](../docs/experiment-design.md).

Keep failed cases and errors. Do not edit prompts or expectations during a comparison run. A fix requires a new batch, with the earlier result retained.
