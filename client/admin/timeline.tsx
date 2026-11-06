import type { Audit } from './types.ts'
import { Badge, RawData } from './common.tsx'

export function Timeline({ turns }: { turns: Array<{ id: string, user: string, assistant: string | null, audit: Audit }> }) {
  return (
    <div className="admin-timeline">
      {turns.map((turn, index) => (
        <article className="admin-turn" key={turn.id}>
          <div className="admin-turn-heading">
            <strong>
              Turn
              {' '}
              {index + 1}
            </strong>
            <div>
              {turn.audit.classification && <Badge value={turn.audit.classification.decision} />}
              <Badge value={turn.audit.review
                ? turn.audit.review.approved ? 'approved' : 'rejected'
                : 'not reviewed'}
              />
              {turn.audit.durationMs !== undefined && (
                <span>
                  {(turn.audit.durationMs / 1000).toFixed(1)}
                  s
                </span>
              )}
            </div>
          </div>
          <div className="transcript-user">
            <span>PROSPECT</span>
            <p>{turn.user}</p>
          </div>
          <div className="transcript-assistant">
            <span>SOPHIE · DISPLAYED REPLY</span>
            <p>{turn.assistant || 'The reply was interrupted.'}</p>
          </div>
          {turn.audit.error && <p role="note" className="admin-error">{turn.audit.error}</p>}
          <details className="turn-evidence">
            <summary>Inspect checks and tool outcomes</summary>
            {turn.audit.classification && (
              <section>
                <h4>Input decision</h4>
                <p>{turn.audit.classification.reason}</p>
              </section>
            )}
            {turn.audit.review && (
              <section>
                <h4>Response review</h4>
                <ul>{turn.audit.review.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </section>
            )}
            {turn.audit.draft && (
              <section>
                <h4>Proposed draft · may differ from displayed reply</h4>
                <p className="draft-text">{turn.audit.draft}</p>
              </section>
            )}
            {turn.audit.tools?.map(tool => (
              <section key={tool.name + JSON.stringify(tool.result)}>
                <h4>
                  {tool.name}
                  {' '}
                  <Badge value={tool.ok ? 'pass' : 'error'} />
                </h4>
                <RawData value={tool.result} label="Tool result" />
              </section>
            ))}
            <p className="admin-footnote">
              Prompt
              {' '}
              {turn.audit.promptVersion || 'unknown'}
              {' '}
              ·
              {turn.audit.models?.agent || 'Unknown model'}
              {' '}
              ·
              {turn.audit.reasoning?.agent || 'Default'}
              {' '}
              reasoning
            </p>
          </details>
        </article>
      ))}
    </div>
  )
}
