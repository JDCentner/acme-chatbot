# Improvements to the supplied agent

The baseline prompt remains the comparison reference. Revised designs preserve its community facts and sales goals while replacing rigid conversation routing with current intent and stored request state.

| Weakness | Change | Measurement |
| --- | --- | --- |
| One large prompt mixes facts, sales flow, voice instructions, and actions | Separate facts, sales instructions, specialist instructions, input check, response review, and task grading | All cases plus source and audit inspection |
| Fake holds, a pretend transfer, telephone-key instructions, and a historic date | One server greeting, honest text-chat disclosure, real runtime clock, local mock actions | AI/contact cases and tour conversations |
| Rigid step routes and a missing Step 9 | Answer current intent and keep request state separately | G32, G33, G36, G40 |
| Unsupported inferences from couples, air conditioning, low salt meals, or pet breed | Explicit fact boundaries and focused community review | T05, T07, T09, T10, G31, G33 |
| Sales progress needs explicit rules | Tour offer after pricing, one useful qualification question for broad interest, appropriate next steps | G37, G38, G39 and calibration C04 |
| AI identity answers omitted the task's human-contact offer | Explicit identity and contact rule | G11, G34, G40 and calibration C06–C07 |
| Repeated contact questions after corrections or topic changes | Use earlier details, ask only one missing field, retain checked slots and saved outcomes | G30, G35, G36, G42 |
| Exact text matching rejected equivalent availability wording | Validate the resolved day and time against user messages | Tour-contract tests, G30, G35, G38 |
| Equivalent ISO time strings could fail slot validation | Store checked and prepared slots in one Eastern-time format | UTC/Eastern contract test and tour workflows |
| The reply reviewer rejected ordinary tour offers and email corrections | Separate proposals and context updates from claims of completed actions | Fresh full live suite and retained review reasons |
| Specialists duplicated the whole sales role and delegated every simple answer | Give them focused fact and request roles; let Sophie answer routine facts directly | Same full suite, routing traces, and reply time |
| A user could try to turn prior text into policy | Treat user claims and earlier conversation as evidence of user needs only | G16–G21 and the complex G43 attack |

## Sales qualification

The task requires basic qualification but does not define a full qualification form. The revised agent asks one relevant question about resident needs or desired care type for a broad inquiry. This is a recorded design choice. It must not block a direct factual answer or force a tour. Tour, callback, and brochure fields still follow the task's collection goals, with the demo's added confirmation rule reported separately.

## Comparison controls

All chat designs use Luna with low reasoning. The original prompt text is unchanged. It uses basic date-lookup and save tools. The better-prompt design adds the server clock and structured facts while using the same basic tools. See [the experiment contract](experiment-design.md). Sol with medium reasoning grades task quality for all designs with the same source rules. Demo checks remain separate.

The suite has 45 cases: ten reference inputs and 35 generated cases. All four designs run against the same cases.
