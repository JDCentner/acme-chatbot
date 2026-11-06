import type { Turn, Variant } from './types.ts'
import { Empty, Message, RawData } from './common.tsx'
import { DESIGNS } from './designs.ts'
import { formatCount } from './format.ts'
import { Timeline } from './timeline.tsx'
import { useLoad } from './use-load.ts'

export function ConversationView({ id }: { id: string }) {
  const { data, error, isLoading } = useLoad<{ turns: Turn[], pending?: unknown, variant: Variant }>(`/conversations/${id}`)
  if (!data || isLoading)
    return <Message error={error} isLoading={isLoading} />
  return (
    <>
      <div className="detail-heading">
        <div>
          <p className="admin-eyebrow">CONVERSATION RECORD</p>
          <h2>{DESIGNS[data.variant]?.name || 'Conversation'}</h2>
          <p>
            {formatCount(data.turns.length, 'turn')}
            {' · Open each turn to inspect checks and tools.'}
          </p>
        </div>
      </div>
      <p className="record-id">{id}</p>
      {!data.turns.length && <Empty>This conversation has no messages yet.</Empty>}
      <Timeline turns={data.turns.map(turn => ({
        id: turn.id,
        user: turn.input,
        assistant: turn.reply,
        audit: JSON.parse(turn.audit),
      }))}
      />
      {data.pending && <RawData value={data.pending} label="Pending request · not saved" />}
    </>
  )
}
