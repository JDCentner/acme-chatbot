import type { EvaluationDetail } from './types.ts'
import { Badge, Message, RawData, Timestamp } from './common.tsx'
import { DESIGNS } from './designs.ts'
import { formatCount } from './format.ts'
import { Timeline } from './timeline.tsx'
import { useLoad } from './use-load.ts'

const CRITERIA: Record<string, string> = { factualSupport: 'Factual support', usefulAnswer: 'Useful answers', contextUse: 'Context use' }
const CHECKS: Record<string, string> = { noDuplicateRequests: 'No duplicate requests', noPipelineErrors: 'No pipeline errors', requestOutcomesMatch: 'Expected request outcomes' }
export function EvaluationView({ id }: { id: string }) {
  const { data, error, isLoading } = useLoad<EvaluationDetail>(`/admin/evaluations/${id}`)
  if (!data || isLoading)
    return <Message error={error} isLoading={isLoading} />
  return (
    <>
      <div className="detail-heading">
        <div>
          <p className="admin-eyebrow">EVALUATION RECORD</p>
          <h2>{DESIGNS[data.input.variant].name}</h2>
          <Timestamp value={data.createdAt} />
        </div>
        <Badge value={data.status} />
      </div>
      <p className="record-id">{data.id}</p>
      <div className="detail-metadata">
        <span>
          {data.mode === 'fake'
            ? 'Fixture run'
            : 'Live model run'}
        </span>
        <span>
          {formatCount(data.transcript.length, 'turn')}
        </span>
        <span>
          {(data.durationMs / 1000).toFixed(1)}
          s total
        </span>
        <span>{data.models?.agent}</span>
      </div>
      <section className="expectations">
        <h3>Expected behavior</h3>
        <p>{data.expectations}</p>
      </section>
      {data.mode === 'fake' && <p className="admin-notice">Fixture runs check integration only. Model quality was not graded.</p>}
      {data.graderError && (
        <p role="alert" className="admin-error">
          Grader error:
          {data.graderError}
        </p>
      )}
      {data.mode === 'live' && <p className="admin-footnote">Model grades need human review. Inspect the cited turns before drawing conclusions.</p>}
      <div className="verdict-grid">
        {Object.entries(CRITERIA).map(([key, label]) => {
          const verdict = data.modelGrade?.[key]
          return (
            <section className="verdict" key={key}>
              <div>
                <h3>{label}</h3>
                <Badge value={verdict
                  ? verdict.passed ? 'pass' : 'fail'
                  : 'not graded'}
                />
              </div>
              {verdict
                ? <ul>{verdict.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                : <p>No model verdict is available.</p>}
            </section>
          )
        })}
      </div>
      <section className="code-checks">
        <h3>Code checks</h3>
        {Object.entries(data.codeChecks).map(([key, passed]) => (
          <div key={key}>
            <span>{CHECKS[key] || key}</span>
            <Badge value={passed ? 'pass' : 'fail'} />
          </div>
        ))}
      </section>
      <h3 className="timeline-title">Complete conversation</h3>
      <Timeline turns={data.transcript.map((turn, index) => ({
        id: `${data.id}-${index}`,
        user: turn.user,
        assistant: turn.assistant,
        audit: turn.audit,
      }))}
      />
      <RawData value={data.facts} label="Fact snapshot for this run" />
      <RawData value={data} label="Full evaluation record" />
    </>
  )
}
