import type { Conversation, Evaluation, SavedRequest } from './types.ts'
import { useState } from 'react'
import { Badge, Empty, Message, Timestamp } from './common.tsx'
import { ConversationView } from './conversation.tsx'
import { DESIGNS } from './designs.ts'
import { EvaluationView } from './evaluation.tsx'
import { formatCount } from './format.ts'
import { RequestView } from './request.tsx'
import { useLoad } from './use-load.ts'

export type RecordKind = 'conversations' | 'evaluations' | 'requests'
type Data = Conversation[] | Evaluation[] | SavedRequest[]
interface ListItem { id: string, title: string, subtitle: string, date: string, status?: string }
const PAGES = {
  conversations: { title: 'Conversations', description: 'Read displayed replies. Inspect input decisions, rejected drafts, reviews, and tool outcomes.' },
  evaluations: { title: 'Evaluations', description: 'Check quality verdicts separately from code checks. Fixture runs do not measure model quality.' },
  requests: { title: 'Saved requests', description: 'Inspect locally saved tours, callbacks, and brochure requests.' },
}
function listItems(kind: RecordKind, data: Data): ListItem[] {
  if (kind === 'conversations') {
    return (data as Conversation[]).map(record => ({
      id: record.id,
      title: record.first_message || 'New conversation',
      subtitle: `${formatCount(record.turn_count, 'turn')} · ${record.id.slice(0, 8)}`,
      date: record.created_at,
    }))
  }
  if (kind === 'evaluations') {
    return (data as Evaluation[]).map(record => ({
      id: record.id,
      title: record.title,
      subtitle: `${DESIGNS[record.variant].name} · ${formatCount(record.turnCount, 'turn')} · ${record.models?.agent || 'Fixture'}`,
      date: record.createdAt,
      status: record.status,
    }))
  }
  return (data as SavedRequest[]).map((record) => {
    const details = JSON.parse(record.details)
    return {
      id: record.id,
      title: `${details.firstName} ${details.lastName}`,
      subtitle: `${record.kind} · ${details.email}`,
      date: record.created_at,
      status: 'saved',
    }
  })
}
export function RecordsView({ kind }: { kind: RecordKind }) {
  const path = kind === 'evaluations'
    ? '/admin/evaluations'
    : `/${kind}`
  const { data, error, isLoading, reload } = useLoad<Data>(path)
  const [selected, setSelected] = useState<string>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const items = data
    ? listItems(kind, data)
    : []
  const visible = items.filter(item => `${item.id} ${item.title} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || item.status === filter))
  const request = kind === 'requests'
    ? (data as SavedRequest[] | undefined)?.find(record => record.id === selected)
    : undefined
  return (
    <section>
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">REVIEW WORKSPACE</p>
          <h1>{PAGES[kind].title}</h1>
          <p>{PAGES[kind].description}</p>
        </div>
        <button className="admin-secondary" onClick={reload} disabled={isLoading}>Refresh records</button>
      </div>
      <div className="record-toolbar">
        <label>
          <span className="sr-only">
            Search
            {PAGES[kind].title.toLowerCase()}
          </span>
          <input type="search" placeholder="Search by question, name, model, or ID…" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        {kind === 'evaluations' && (
          <label>
            <span className="sr-only">Evaluation status</span>
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">All results</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="error">Error</option>
              <option value="fixture_only">Fixture · not graded</option>
            </select>
          </label>
        )}
        <span>
          {formatCount(visible.length, 'record')}
          {kind === 'evaluations'
            ? ' · latest 100'
            : ''}
        </span>
      </div>
      <Message error={error} isLoading={isLoading} />
      {!isLoading && !error && (
        <div className={`record-workspace ${selected ? 'has-selection' : ''}`}>
          <div className="record-list" aria-label={`${PAGES[kind].title} list`}>
            {!visible.length && <Empty>{items.length ? 'No records match this search.' : 'No records yet.'}</Empty>}
            {visible.map(item => (
              <button
                key={item.id}
                className={`record-list-item ${selected === item.id
                  ? 'selected'
                  : ''}`}
                onClick={() => setSelected(item.id)}
                aria-pressed={selected === item.id}
              >
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
                <div>
                  <Timestamp value={item.date} />
                  {item.status && <Badge value={item.status} />}
                </div>
              </button>
            ))}
          </div>
          <div className="record-detail">
            <button className="record-back" onClick={() => setSelected(undefined)}>← Back to records</button>
            {!selected && <Empty>Choose a record to see its details.</Empty>}
            {selected && kind === 'conversations' && <ConversationView id={selected} />}
            {' '}
            {selected && kind === 'evaluations' && <EvaluationView id={selected} />}
            {' '}
            {request && <RequestView request={request} />}
          </div>
        </div>
      )}
    </section>
  )
}
