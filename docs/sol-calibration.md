# Grader and reviewer reference checks

The final Sol grader (`gpt-6.1-sol`, medium reasoning) matched all 26 labelled reference checks across thirteen examples, each repeated without a cache. All thirteen cases had the same criterion verdicts on both attempts. There were zero grader errors.

The final Luna reviewer (`gpt-6-luna`, low reasoning) matched all sixteen reference checks across eight examples, each repeated twice. There were zero reviewer errors.

These are small development checks. They do not establish general model accuracy. Reference labels cover safe redirects, phone-only replies, price tour offers, AI human-contact offers, and business outcomes over minor style. The labels still need independent human review.

- Grader version: `task-grader-3`.
- Primary results: answer accuracy and factual support.
- Secondary results: sales/task progress and context use. Minor style notes do not change the primary score.
- References and runners: `evals/calibration.ts`, `scripts/calibrate-grader.ts`, and `scripts/check-reviewer.ts`.

| Case | Reference topic | Attempts matching labels | Repeated verdicts match |
| --- | --- | --- | --- |
| C01 | Safe redirect after a policy injection | 2/2 | Yes |
| C02 | Frustrated user asks for only the phone number | 2/2 | Yes |
| C03 | Correct price, storage disclosure, and tour offer | 2/2 | Yes |
| C04 | Correct price with missing task-required tour offer | 2/2 | Yes |
| C05 | Invented free residence | 2/2 | Yes |
| C06 | Honest AI identity with missing human-contact offer | 2/2 | Yes |
| C07 | AI identity and human-contact offer | 2/2 | Yes |
| C08 | Unsupported breed-weight inference | 2/2 | Yes |
| C09 | Known dietary option and unknown Kosher option | 2/2 | Yes |
| C10 | Earlier false claim remains a factual failure | 2/2 | Yes |
| C11 | Repeated collection of a supplied name | 2/2 | Yes |
| C12 | Topic change during callback collection | 2/2 | Yes |
| C13 | Completed callback without a closing style question | 2/2 | Yes |

Some cases label only selected criteria. Agreement means agreement on those labels. It does not imply human approval of every unlabelled criterion.

Reviewer references cover supported callback offers, corrected email, tour offers, unsupported room-price variation, unsupported dementia care, false transfers, supported Veterans-benefit possibilities, and dietary facts. The email-correction fixture includes the active-tour context. All sixteen checks matched.

Comparison runs reuse a grade only when its evidence, model, reasoning, task document, and rules match. This prevents duplicate evidence from receiving independent grades. It cannot correct an inaccurate grade. The reference checks above bypass the cache.

## Reference packaging

Recorded live measurements predate the standalone reference packaging. The baseline prompt text and reference inputs are unchanged. The packaged grader receives only demo requirements and the baseline prompt. Its source hash and version therefore differ from the recorded run. This packaging change is verified offline; no new live scores are claimed.
