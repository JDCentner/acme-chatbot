# Four agent designs

The comparison tests four approaches with one frozen suite and one blind Sol grader.

| Feature | Original | Better prompt | Checks | Specialists |
| --- | --- | --- | --- | --- |
| Exact original prompt | Yes | No | No | No |
| Current server time | No | Yes | Yes | Yes |
| Added structured facts | No | Yes | Yes | Yes |
| Normal transcript history | Yes | Yes | Yes | Yes |
| Normal tool-call history | Yes | Yes | Tool state | Tool state |
| Basic date lookup and save | Yes | Yes | No | No |
| Structured request state | No | No | Yes | Yes |
| Server contact-source and confirmation checks | No | No | Yes | Yes |
| Input classifier | No | No | Yes | Yes |
| Response review and correction | No | No | Yes | Yes |
| Specialist calls | No | No | No | Yes |

All options use Luna with low reasoning. All use local SQLite mock records, contact syntax checks, transactional saves, one booking per slot, and duplicate protection. All validate HTTP messages before model use. Nothing contacts staff or sends material.

The original has its original community facts and historic March 2025 date. No runtime adapter overrides its prompt. Basic `check_slots` accepts an absolute calendar date and returns actual local inventory. It does not translate relative words or return the current date. Basic `save_request` validates required fields and inventory. It does not establish that the user supplied those fields or confirmed a summary. The better prompt must manage those tasks from ordinary history. The two simple designs retain SDK history, including tool calls and results, in SQLite audits.

The guarded designs retain the existing stronger request tools and orchestration. These comparisons therefore measure complete designs. They do not isolate the classifier from action controls or structured state.

Original production tool definitions were not available. These tools are reasonable local mock contracts, not recovered production behavior. The baseline still receives tool definitions and ordinary API validation. It is an unassisted prompt baseline within this app.

The grader receives the actual displayed greeting, community facts, displayed transcript, successful and failed tool results, and the current evaluation date. It does not receive the design label or hidden drafts. A wrong date remains wrong even when it came from the original script. Voice pauses and exact script style are advisory. Real transfers and deliveries are not required or permitted by the mock app.

## One-run budget

Set `API_BUDGET_USD=35` for the authorized comparison. The ledger is stored in the Docker app data volume. The guard reserves each request before sending it. Concurrent calls share that reservation total. Restarting the server keeps the ledger. It blocks unpriced models and streaming calls while enabled. API retries are disabled.

Reservations use the UTF-8 request byte count plus a schema margin as a conservative input-token estimate. They include the full configured output limit. Successful responses replace reservations with token usage at conservative rates: Luna $0.20 input/$1 output and Sol $4 input/$20 output per million tokens. These exceed the listed standard short-context rates at implementation time. Cached input is counted at the full input rate. Missing usage, failed calls, and interrupted calls retain their reservations. These amounts are a local upper estimate, not a billing statement. See [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

The cap applies to calls from this app process and its persistent ledger. It cannot enforce an account-wide limit or observe other clients. Do not delete the ledger or run a second app against the same key during the comparison.

The frozen suite has 45 cases and four designs, for 180 combinations. It includes ten unchanged reference inputs, longer conversations, unsupported claims, jailbreaks, and an explicit stale-date case. One complete run is authorized. There are no separate live smoke tests, calibration calls, or retries of failed cases.
