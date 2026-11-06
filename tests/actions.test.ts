import type { ModelProvider } from '../server/contracts.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Actions } from '../server/actions.ts'
import { FALLBACK_REPLY } from '../server/contracts.ts'
import { evaluate } from '../server/evaluations.ts'
import { ConversationService } from '../server/service.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'
import { resolveAvailability, seedSlots } from '../server/time.ts'

const clock = () => new Date('2026-11-05T15:00:00Z')
function setup(provider: ModelProvider = new FakeProvider()) {
  const store = new Store(':memory:', clock)
  const conversation = store.createConversation()
  const service = new ConversationService(store, provider)
  const send = (message: unknown, requestId = randomUUID()) => service.submit(conversation.id, { message, requestId }) as Promise<{ reply: string, pendingId?: string }>
  return { store, conversation, service, send }
}
function override(changes: Partial<ModelProvider>): ModelProvider {
  const fake = new FakeProvider()
  return {
    mode: 'fake',
    models: fake.models,
    classify: fake.classify.bind(fake),
    draft: fake.draft.bind(fake),
    review: fake.review.bind(fake),
    grade: fake.grade.bind(fake),
    ...changes,
  }
}

test('dates resolve using the server clock and Eastern zone', () => {
  assert.deepEqual(resolveAvailability('next Tuesday at 2pm', clock), { date: '2026-11-10', hour: 14 })
})
test('invalid dates and off-hour times are rejected', () => {
  assert.throws(() => resolveAvailability('2026-02-30', clock))
  assert.throws(() => resolveAvailability('Tuesday at 2:30pm', clock))
})
test('seeded slots have weekday starts from 9 through 17', () => {
  const slots = seedSlots(clock)
  assert.ok(slots.length > 100)
  assert.ok(slots.every(slot => !slot.startsWith('2026-11-08')))
  assert.ok(slots.some(slot => slot.startsWith('2026-11-06T17:00')))
  assert.ok(slots.every(slot => !slot.includes('T18:00')))
})
test('sunday tour is not booked', async () => {
  const { send, store } = setup()
  assert.match((await send('I want a tour next Sunday at 3pm')).reply, /not available/)
  assert.equal(store.requests().length, 0)
  store.close()
})
async function prepareTour() {
  const state = setup()
  for (const message of [
    'I want a tour next Tuesday at 2pm',
    'James',
    'Smith',
    'james@example.com',
    '202-555-0123',
  ])
    await state.send(message)
  return state
}
test('complete tour needs confirmation before it is saved', async () => {
  const { send, store, conversation } = await prepareTour()
  assert.equal(store.requests().length, 0)
  const pending = store.pending(conversation.id)
  assert.ok(pending?.presented)
  await send(`Confirm request ${pending.id}`)
  assert.equal(store.requests().length, 1)
  store.close()
})
test('changed details invalidate the previous summary', async () => {
  const { send, store, conversation } = await prepareTour()
  const previous = store.pending(conversation.id)!
  await send('My email is changed@example.com')
  const result = new Actions(store).execute({
    conversationId: conversation.id,
    message: `Confirm request ${previous.id}`,
    name: 'confirm_request',
    arguments: { pendingId: previous.id },
  })
  assert.equal(result.ok, false)
  assert.equal(store.requests().length, 0)
  store.close()
})
test('completed booking remains saved if review fails', async () => {
  let shouldReject = false
  const state = setup(override({
    review: async () => ({
      approved: !shouldReject,
      reasons: ['test'],
    }),
  }))
  for (const message of [
    'I want a tour next Tuesday at 2pm',
    'James',
    'Smith',
    'james@example.com',
    '202-555-0123',
  ])
    await state.send(message)
  shouldReject = true
  assert.equal((await state.send('confirm')).reply, FALLBACK_REPLY)
  assert.equal(state.store.requests().length, 1)
  state.store.close()
})
test('competing booking rechecks slot availability', async () => {
  const state = await prepareTour()
  const firstPending = state.store.pending(state.conversation.id)!
  const second = state.store.createConversation()
  const details = JSON.parse(firstPending.details)
  state.store.database.prepare('INSERT INTO checked_slots VALUES (?, ?)').run(second.id, details.slot)
  const secondPending = state.store.prepareRequest(second.id, details)
  state.store.presentPending(secondPending.id)
  const actions = new Actions(state.store)
  assert.equal(actions.execute({
    conversationId: state.conversation.id,
    message: 'confirm',
    name: 'confirm_request',
    arguments: { pendingId: firstPending.id },
  }).ok, true)
  assert.equal(actions.execute({
    conversationId: second.id,
    message: 'confirm',
    name: 'confirm_request',
    arguments: { pendingId: secondPending.id },
  }).ok, false)
  assert.equal(state.store.requests().length, 1)
  state.store.close()
})
test('restart retains records and interrupted tool audit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acme-'))
  const path = join(directory, 'test.sqlite')
  let store = new Store(path, clock)
  const conversation = store.createConversation()
  const id = store.startTurn({
    conversationId: conversation.id,
    requestId: randomUUID(),
    message: 'tour',
  })
  store.checkpoint(id, {
    tools: [
      { status: 'saved' },
    ],
  })
  store.close()
  store = new Store(path, clock)
  assert.match(store.turns(conversation.id)[0].audit, /saved/)
  assert.ok(store.turns(conversation.id)[0].reply)
  store.close()
  rmSync(directory, { recursive: true })
})
test('fixture evaluation is isolated and never reports model quality pass', async () => {
  const { store } = setup()
  const result = await evaluate(store, new FakeProvider(), {
    variant: 'single',
    messages: ['Can my dad bring his car?'],
    expectations: 'Residents can have cars.',
  }) as { status: string }
  assert.equal(result.status, 'fixture_only')
  assert.equal(store.requests().length, 0)
  store.close()
})
test('tools cannot prepare a request with missing contact details', () => {
  const { store, conversation } = setup()
  const result = new Actions(store).execute({
    conversationId: conversation.id,
    message: 'tour',
    name: 'prepare_request',
    arguments: { kind: 'tour' },
  })
  assert.equal(result.ok, false)
  assert.equal(store.pending(conversation.id), undefined)
  store.close()
})
test('slot lookup requires availability supplied by the user', () => {
  const { store, conversation } = setup()
  const result = new Actions(store).execute({
    conversationId: conversation.id,
    message: 'hello',
    name: 'check_slots',
    arguments: { availability: 'Tuesday at 2pm' },
  })
  assert.equal(result.ok, false)
  store.close()
})
test('a pending summary that was not displayed cannot be saved', () => {
  const { store, conversation } = setup()
  const pending = store.prepareRequest(conversation.id, {
    kind: 'callback',
    firstName: 'James',
    lastName: 'Smith',
    email: 'james@example.com',
    phone: '2025550123',
    preferredTime: 'tomorrow',
    address: null,
    slot: null,
  })
  const result = new Actions(store).execute({
    conversationId: conversation.id,
    message: 'confirm',
    name: 'confirm_request',
    arguments: { pendingId: pending.id },
  })
  assert.equal(result.ok, false)
  assert.equal(store.requests().length, 0)
  store.close()
})
test('contact details not supplied by the user are rejected', () => {
  const { store, conversation } = setup()
  const result = new Actions(store).execute({
    conversationId: conversation.id,
    message: 'callback',
    name: 'prepare_request',
    arguments: {
      kind: 'callback',
      firstName: 'James',
      lastName: 'Smith',
      email: 'james@example.com',
      phone: '2025550123',
      preferredTime: 'tomorrow',
      address: null,
      slot: null,
    },
  })
  assert.equal(result.ok, false)
  store.close()
})
test('confirmed callbacks are not saved twice when re-prepared', async () => {
  const { store, send } = setup()
  for (const message of [
    'I want a callback',
    'James',
    'Smith',
    'james@example.com',
    '202-555-0123',
    'tomorrow at 2pm',
    'confirm',
    'confirm',
  ])
    await send(message)
  assert.equal(store.requests().length, 1)
  store.close()
})
test('a malformed reviewer verdict cannot approve a draft', async () => {
  const { send, store } = setup(override({
    review: async () => ({ approved: true }),
  }))
  assert.equal((await send('Can my dad bring his car?')).reply, FALLBACK_REPLY)
  store.close()
})
test('a grader failure is an evaluation error', async () => {
  const { store } = setup()
  const result = await evaluate(store, override({
    mode: 'live',
    grade: async () => {
      throw new Error('grader offline')
    },
  }), {
    variant: 'single',
    messages: ['Can my dad bring his car?'],
    expectations: 'Residents can have cars.',
  }) as { status: string }
  assert.equal(result.status, 'error')
  store.close()
})
