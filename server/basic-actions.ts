import type { RequestDetails, ToolResult } from './contracts.ts'
import type { Store } from './store.ts'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { z } from 'zod'
import { requestDetailsSchema, TIME_ZONE } from './contracts.ts'
import { canonicalSlot, isBookableSlot } from './time.ts'

export class BasicActions {
  constructor(private readonly store: Store) {}

  execute(input: { conversationId: string, name: string, arguments: unknown }): ToolResult {
    try {
      const handlers: Record<string, () => unknown> = {
        check_slots: () => this.checkSlots(input.arguments),
        save_request: () => this.saveRequest(input.conversationId, input.arguments),
      }
      const handler = handlers[input.name]
      if (!handler)
        throw new Error('Unknown tool.')
      return {
        name: input.name,
        ok: true,
        result: handler(),
      }
    }
    catch (error) {
      return {
        name: input.name,
        ok: false,
        result: {
          error: error instanceof Error
            ? error.message
            : 'The action failed.',
        },
      }
    }
  }

  private checkSlots(arguments_: unknown): unknown {
    const { date } = z.object({
      date: z.iso.date(),
    }).strict().parse(arguments_)
    this.store.refreshSlots()
    const rows = this.store.database.prepare('SELECT s.slot FROM slots s LEFT JOIN requests r ON r.slot=s.slot WHERE r.id IS NULL AND s.slot LIKE ? ORDER BY s.slot').all(`${date}%`) as { slot: string }[]
    return {
      date,
      slots: rows.map(row => row.slot).filter(slot => isBookableSlot(slot, this.store.clock)),
      timeZone: TIME_ZONE,
      demo: true,
    }
  }

  private saveRequest(conversationId: string, arguments_: unknown): unknown {
    const details = requestDetailsSchema.parse(arguments_)
    if (details.kind === 'tour')
      details.slot = canonicalSlot(details.slot!)
    const serialized = JSON.stringify(details)
    this.store.database.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.store.database.prepare('SELECT * FROM requests WHERE conversation_id=? AND kind=? AND details=?').get(conversationId, details.kind, serialized)
      if (existing) {
        this.store.database.exec('COMMIT')
        return { status: 'already_saved', request: existing, demo: true }
      }
      this.validateSlot(details)
      const id = randomUUID()
      const createdAt = this.store.clock().toISOString()
      // The legacy storage row records no server confirmation for this experiment.
      this.store.database.prepare('INSERT INTO pending_requests VALUES (?, ?, ?, ?, 0, ?, ?)').run(id, conversationId, serialized, 'Saved through a basic tool. Server confirmation was not enforced.', 'basic_saved', createdAt)
      this.store.database.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, conversationId, id, details.kind, serialized, details.kind === 'tour'
        ? details.slot
        : null, createdAt)
      this.store.database.exec('COMMIT')
      return {
        status: 'saved',
        requestId: id,
        details,
        demo: true,
      }
    }
    catch (error) {
      this.store.database.exec('ROLLBACK')
      throw error
    }
  }

  private validateSlot(details: RequestDetails): void {
    if (details.kind !== 'tour')
      return
    const slot = details.slot!
    if (!DateTime.fromISO(slot).isValid || !isBookableSlot(slot, this.store.clock))
      throw new Error('This tour slot is outside the available inventory.')
    if (this.store.database.prepare('SELECT id FROM requests WHERE slot=?').get(slot))
      throw new Error('This tour slot is no longer available.')
  }
}
