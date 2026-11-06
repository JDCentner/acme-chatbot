import type { SavedRequest } from './types.ts'
import { Badge, RawData, Timestamp } from './common.tsx'

export function RequestView({ request }: { request: SavedRequest }) {
  const details = JSON.parse(request.details) as { firstName: string, lastName: string, email: string, phone: string, slot?: string, preferredTime?: string, address?: string }
  return (
    <>
      <div className="detail-heading">
        <div>
          <p className="admin-eyebrow">SAVED REQUEST</p>
          <h2>
            {details.firstName}
            {' '}
            {details.lastName}
          </h2>
          <Timestamp value={request.created_at} />
        </div>
        <Badge value="saved" />
      </div>
      <p className="admin-notice">Local demo record only. No staff were contacted and no material was sent.</p>
      <dl className="request-details">
        <div>
          <dt>Request type</dt>
          <dd>{request.kind}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd><a href={`mailto:${details.email}`}>{details.email}</a></dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{details.phone}</dd>
        </div>
        {details.slot && (
          <div>
            <dt>Tour time</dt>
            <dd>
              {new Date(details.slot).toLocaleString(undefined, { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })}
              {' '}
              · Eastern
            </dd>
          </div>
        )}
        {details.preferredTime && (
          <div>
            <dt>Preferred callback time</dt>
            <dd>{details.preferredTime}</dd>
          </div>
        )}
        {details.address && (
          <div>
            <dt>Mailing address</dt>
            <dd>{details.address}</dd>
          </div>
        )}
        <div>
          <dt>Conversation ID</dt>
          <dd className="record-id">{request.conversation_id}</dd>
        </div>
      </dl>
      <RawData value={request} label="Full request record" />
    </>
  )
}
