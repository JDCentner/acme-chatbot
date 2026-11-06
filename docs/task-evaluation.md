# Task-based grading

The source is the demo requirements. The first ten evaluation inputs remain exact copies of its ten examples. Generated conversations test the same business goals: accurate answers, tour support, basic qualification, concise replies, useful next steps, and use of prior context.

## Task grades and demo checks

The Sol task grader receives the full task document, exact source quotations, displayed replies, the community fact snapshot, and tool evidence. It does not receive agent design labels, hidden drafts, reviewer opinions, scenario notes, or demo code-check verdicts.

The final scorecard follows the four customer-confidence goals in the demo requirements. Accuracy and factual support are the primary conversation result. Sales progress and context remain separate secondary diagnostics. Minor script and closing-style issues are advisory notes:

| Criterion | Source in the demo requirements | Failure evidence |
| --- | --- | --- |
| Answer accuracy: primary | Accuracy goal | An incorrect or irrelevant answer, or a fallback for an answerable question |
| Factual support: primary | No Hallucination, Do Not Make Things Up | A specific unsupported or conflicting claim |
| Sales and task progress: secondary | Direct response, role, style, and applicable Steps 2–20 | A missing or incorrect task behavior |
| Context use: secondary | Previous conversation guideline | A failure to use a relevant earlier turn or correction |

Each failure needs a source requirement ID, a turn number, and an exact quote from the displayed reply. Code rejects missing, invented, or misassigned evidence. Context retention does not apply to a single-turn case; the criterion passes as a neutral result. This does not measure memory on those cases.

Demo checks remain separate. These include the 30-day inventory, one-hour slot starts, explicit confirmation, duplicate records, and exact saved-request outcomes. They remain visible in admin records. They do not add task requirements or change the primary task verdict. A tool failure can still fail task usefulness when it stops the user's requested workflow.

Previewability and monitoring are system properties. The public demo, design selector, admin timelines, stored drafts, reference checks, and audit tests provide evidence for them. A rejected draft can receive one correction without tools, followed by another review. A conversational judge does not establish those properties.

## Source rules

`server/grading-rubric.ts` contains the requirement catalog. Each quotation is tested against the demo requirements. Each grading record stores the task document hash, grader version, grader model, reasoning setting, input hash, evidence, and verdict.

Specific rules include:

- Step 2: ask about the prospect's availability first; use weekday tour hours.
- Step 3: collect first and last name, email, and phone in separate questions for tours.
- Step 4: disclose AI identity and offer human contact; provide the phone for contact inquiries.
- Step 5: answer prices accurately and offer a tour.
- Step 6: use known amenities, explain missing information, and avoid repeated tour offers.
- Step 10: collect brochure name, email, phone, and address separately.
- Step 11: provide the exact careers link.
- Steps 19–20: explain unknowns, offer team contact, and collect callback name, email, phone, and preferred time.
- Style and context: stay concise, respond to the current question, use earlier details, and give suitable next steps.

## Recorded interpretations

The task permits prompt changes and mock rules. The following interpretations are explicit. They are not new community facts.

- Text chat omits voice pauses, telephone-key instructions, fake holds, and pretend transfers.
- Relative dates use the runtime clock instead of the historic date in the original prompt.
- Local mock actions do not contact staff or deliver material. An honest human-contact option can use the supplied phone number.
- A direct scope redirect is an acceptable refusal to an attack. It does not need to explain the attack.
- A bare phone number is sufficient when the user asks for only the number. Do not impose an extra emotional acknowledgment.
- A price answer without the Step 5 tour offer fails usefulness. It can still pass factual support.
- An AI-identity answer without the Step 4 human-contact offer fails usefulness.
- Do not ask for fields already supplied to preserve a numbered sequence. Do not ignore part of a related compound question to enforce a one-topic style rule.

The four customer-confidence goals define the primary scorecard. Literal script replay is not required. Minor closing and style omissions are advisory. The documented boundaries cover redirects, phone-only replies, price tour offers, and AI human-contact offers. Other reference labels remain open to human review.

## Grader checks

Sol (`gpt-6.1-sol`) grades quality. Luna remains the chat, input-check, and reply-review model. Sol uses medium reasoning. The default remains configurable. The final rubric is task-grader-3. The primary status uses answerAccuracy and factualSupport. taskStatus retains the complete task diagnostic; codeStatus retains the demo checks.

`evals/calibration.ts` contains thirteen reference examples. They cover completed requests, task-required next steps, unsupported claims, and context errors. `scripts/calibrate-grader.ts` grades each example twice without a cache. Its report includes agreement with reference labels, repeated-verdict agreement, and errors. Partial labels test only the stated criteria.

Comparison runs reuse a valid saved grade only when task text, rules, model, reasoning, date, facts, transcript, and tool evidence match. This prevents duplicate evidence from getting independent random grades. It does not prove that a cached grade is correct. Uncached calibration is still required.

Run calibration only after authorizing API use:

```sh
docker compose exec -e GRADER_MODEL=gpt-6.1-sol app pnpm exec tsx scripts/calibrate-grader.ts
```

The output path defaults to `the temporary report file` inside the app container. It includes fictional reference transcripts only. Set `CALIBRATION_OUTPUT` to retain it elsewhere. Grader errors cannot pass.

## Saved-reply regrading

`POST /api/admin/evaluations/:id/regrade` accepts a new `batchId`. It grades the saved displayed replies and original facts. It never runs chat agents or tools. It saves a linked result and preserves the source record. Errors are saved as errors.

Keep grader-only regrades separate from fresh agent runs. A fresh agent run measures changed behavior. A regrade measures a changed evaluation rule or grader.

## Reference packaging

Recorded live measurements predate the standalone reference packaging. The baseline prompt text and reference inputs are unchanged. The packaged grader receives only demo requirements and the baseline prompt. Its source hash and version therefore differ from the recorded run. This packaging change is verified offline; no new live scores are claimed.
