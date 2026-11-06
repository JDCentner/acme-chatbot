# Recorded evaluations

These compressed SQLite snapshots contain saved evaluation results. Viewing them does not require an API key or new model calls.

| File | Contents |
| --- | --- |
| `promptfoo.db.gz` | One Promptfoo evaluation with 180 result rows. |
| `acme.sqlite.gz` | 180 app evaluation records and their saved grades. |

The app snapshot contains only `evaluation_cases`, `evaluation_runs`, and `evaluation_grades`. It excludes ordinary chat sessions, contact requests, settings, and the API budget ledger. Logs and credentials are excluded. Email addresses in the snapshots use `example.com`.

Both snapshots contain batch `luna-sol-four-20261106T195604Z`: 45 cases across four designs. Failures and pipeline errors remain included. See [the evaluation report](../../docs/latest-evaluation-report.md).

The [manifest](manifest.json) records the export time, batch ID, row counts, sizes, and SHA-256 checksums. Snapshots are fixed copies. New local runs do not update them.

## Restore copies

Use Node.js 24+, pnpm 12.10.1, and gzip. Run these commands from the repository root. Use a new destination directory; the subshell refuses to overwrite an existing directory.

```sh
pnpm install --frozen-lockfile
pnpm build
(
  set -e
  mkdir data/recorded-evaluations
  gzip -dc evals/snapshots/promptfoo.db.gz > data/recorded-evaluations/promptfoo.db
  gzip -dc evals/snapshots/acme.sqlite.gz > data/recorded-evaluations/acme.sqlite
)
```

Start Promptfoo in one terminal:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_CONFIG_DIR="$PWD/data/recorded-evaluations" pnpm exec promptfoo view --port 15501 --no
```

Open <http://localhost:15501> for the comparison table.

Start the app in another terminal:

```sh
NODE_ENV=production MODEL_MODE=fake DATABASE_PATH="$PWD/data/recorded-evaluations/acme.sqlite" PORT=3001 pnpm start
```

Open <http://localhost:3001/admin> for all 180 runs and their turn evidence. The app creates its other tables in the restored copy.

These commands use separate files and ports from the Docker stack. Restored files stay in the ignored `data/` directory. The compressed snapshots remain unchanged.
