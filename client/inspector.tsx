import React, { useState } from 'react'
import { api } from './api.ts'

export function Inspector() {
  const [data, setData] = useState<unknown>()
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  async function inspect(path: string) {
    setIsBusy(true)
    setError('')
    try {
      setData(await api(path))
    }
    catch (error) {
      setError(error instanceof Error
        ? error.message
        : 'Could not load results.')
    }
    finally {
      setIsBusy(false)
    }
  }
  return (
    <section className="inspector">
      <p className="eyebrow">DEMO EVIDENCE</p>
      <h2>See what happened.</h2>
      <p>Use Promptfoo to run the same cases across all three designs. Fixture runs verify software behavior. They do not measure model quality.</p>
      <div className="inspect-actions">
        <a className="primary" href="http://localhost:15500" target="_blank" rel="noreferrer">Open evaluation results ↗</a>
        <button disabled={isBusy} onClick={() => inspect('/conversations')}>Conversations</button>
        <button disabled={isBusy} onClick={() => inspect('/requests')}>Saved requests</button>
        <button disabled={isBusy} onClick={() => inspect('/evaluations')}>Evaluation records</button>
      </div>
      <p>
        Run evaluations:
        <code>docker compose --env-file .env.example run --build --rm evals</code>
      </p>
      <label>
        Conversation ID
        <input
          placeholder="Paste an ID from the list"
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              void inspect(`/conversations/${event.currentTarget.value}`)
          }}
        />
      </label>
      <p className="caption">Press Enter to inspect the transcript, decisions, drafts, reviews, and tool outcomes.</p>
      {error && <p role="alert">{error}</p>}
      {data !== undefined && <pre tabIndex={0}>{JSON.stringify(data, null, 2)}</pre>}
    </section>
  )
}
