import {DateTime} from 'luxon';
import {z} from 'zod';
import {requestDetailsSchema, TIME_ZONE, type RequestDetails, type ToolResult} from './contracts.ts';
import {Store, type Pending} from './store.ts';
import {isBookableSlot, resolveAvailability} from './time.ts';

export function isConfirmation(message: string, pendingId?: string): boolean {
  const text = message.trim().toLowerCase().replace(/[.!]$/, '');
  return ['yes', 'confirm', 'yes, confirm', 'yes please', `confirm request ${pendingId}`].includes(text);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@]/g, '');
}

function validateSource(details: RequestDetails, userText: string): void {
  const fields = [details.firstName, details.lastName, details.email, details.phone, details.preferredTime, details.address].filter((field): field is string => Boolean(field));
  if (fields.some(field => !normalized(userText).includes(normalized(field)))) throw new Error('Use only contact details supplied by the user.');
}

export class Actions {
  constructor(private readonly store: Store) {}

  execute(input: {conversationId: string; message: string; name: string; arguments: unknown}): ToolResult {
    try {
      const handlers: Record<string, () => unknown> = {
        check_slots: () => this.checkSlots(input.conversationId, input.arguments),
        prepare_request: () => this.prepare(input.conversationId, input.arguments),
        confirm_request: () => this.confirm(input),
      };
      const handler = handlers[input.name];
      if (!handler) throw new Error('Unknown tool.');
      return {name: input.name, ok: true, result: handler()};
    } catch (error) {
      return {name: input.name, ok: false, result: {error: error instanceof Error ? error.message : 'The action failed.'}};
    }
  }

  private userText(conversationId: string): string {
    return this.store.turns(conversationId).filter(turn => turn.decision === 'allow').map(turn => turn.input).join('\n');
  }

  private checkSlots(conversationId: string, args: unknown): unknown {
    const {availability} = z.object({availability: z.string().min(1).max(4000)}).strict().parse(args);
    if (!this.userText(conversationId).toLowerCase().includes(availability.toLowerCase())) throw new Error('Ask for the user’s availability first.');
    const requested = resolveAvailability(availability, this.store.clock);
    this.store.refreshSlots();
    const available = this.store.database.prepare('SELECT s.slot FROM slots s LEFT JOIN requests r ON r.slot=s.slot WHERE r.id IS NULL AND s.slot LIKE ? ORDER BY s.slot').all(`${requested.date}%`) as {slot: string}[];
    const slots = available.map(row => row.slot).filter(slot => isBookableSlot(slot, this.store.clock)).filter(slot => requested.hour === null || DateTime.fromISO(slot).setZone(TIME_ZONE).hour === requested.hour);
    for (const slot of slots) this.store.database.prepare('INSERT OR IGNORE INTO checked_slots VALUES (?, ?)').run(conversationId, slot);
    return {availability, resolvedDate: requested.date, slots, timeZone: TIME_ZONE, demo: true};
  }

  private prepare(conversationId: string, args: unknown): unknown {
    const details = requestDetailsSchema.parse(args);
    validateSource(details, this.userText(conversationId));
    if (details.kind === 'tour') this.validateTour(conversationId, details.slot!);
    const pending = this.store.prepareRequest(conversationId, details);
    return {pendingId: pending.id, summary: pending.summary, details, status: 'needs_confirmation'};
  }

  private validateTour(conversationId: string, slot: string): void {
    if (!isBookableSlot(slot, this.store.clock)) throw new Error('Choose a future weekday tour slot within the next 30 days.');
    const checked = this.store.database.prepare('SELECT slot FROM checked_slots WHERE conversation_id=? AND slot=?').get(conversationId, slot);
    if (!checked) throw new Error('Check this slot against the user’s availability first.');
    if (this.store.database.prepare('SELECT id FROM requests WHERE slot=?').get(slot)) throw new Error('This slot is no longer available. Please choose another time.');
  }

  private confirm(input: {conversationId: string; message: string; arguments: unknown}): unknown {
    const {pendingId} = z.object({pendingId: z.uuid()}).strict().parse(input.arguments);
    if (!isConfirmation(input.message, pendingId)) throw new Error('Explicit confirmation of the displayed summary is required.');
    const existing = this.store.requests().find(request => request.pending_id === pendingId && request.conversation_id === input.conversationId);
    if (existing) return {status: 'already_saved', request: existing, demo: true};
    const pending = this.store.pending(input.conversationId);
    if (!pending || pending.id !== pendingId || !pending.presented) throw new Error('Review and confirm the current request summary first.');
    return this.saveConfirmed(pending);
  }

  private saveConfirmed(pending: Pending): unknown {
    const details = requestDetailsSchema.parse(JSON.parse(pending.details));
    this.store.database.exec('BEGIN IMMEDIATE');
    try {
      if (details.kind === 'tour') this.validateTour(pending.conversation_id, details.slot!);
      this.store.database.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?)').run(pending.id, pending.conversation_id, pending.id, details.kind, JSON.stringify(details), details.kind === 'tour' ? details.slot : null, this.store.clock().toISOString());
      this.store.database.prepare("UPDATE pending_requests SET status='saved' WHERE id=?").run(pending.id);
      this.store.database.exec('COMMIT');
      return {status: 'saved', requestId: pending.id, details, demo: true};
    } catch (error) {
      this.store.database.exec('ROLLBACK');
      throw error;
    }
  }
}
