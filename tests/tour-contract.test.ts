import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Actions } from '../server/actions.ts'
import { Store } from '../server/store.ts'

const clock = () => new Date('2026-11-05T15:00:00Z')
function suppliedAvailability(message: string) {
  const store = new Store(':memory:', clock)
  const conversation = store.createConversation()
  const id = store.startTurn({
    conversationId: conversation.id,
    requestId: randomUUID(),
    message,
  })
  store.finishTurn({
    id,
    decision: 'allow',
    reply: 'I will check that time.',
    audit: {},
  })
  return {
    store,
    conversationId: conversation.id,
    actions: new Actions(store),
  }
}

test('equivalent availability wording does not stop a tour workflow', () => {
  const state = suppliedAvailability('Next Tuesday at 2pm would work for me.')
  try {
    const result = state.actions.execute({
      conversationId: state.conversationId,
      message: 'Next Tuesday at 2pm would work for me.',
      name: 'check_slots',
      arguments: { availability: '2026-11-10 at 14:00' },
    })
    assert.equal(result.ok, true)
    assert.equal((result.result as { slots: string[] }).slots.length, 1)
  }
  finally { state.store.close() }
})

test('an invented time is still rejected after accepting equivalent wording', () => {
  const state = suppliedAvailability('Next Tuesday at 2pm would work for me.')
  try {
    const result = state.actions.execute({
      conversationId: state.conversationId,
      message: 'Next Tuesday at 2pm would work for me.',
      name: 'check_slots',
      arguments: { availability: '2026-11-10 at 10:00' },
    })
    assert.equal(result.ok, false)
  }
  finally { state.store.close() }
})

test('an equivalent UTC slot can prepare the previously checked Eastern slot', () => {
  const state = suppliedAvailability('Next Tuesday at 2pm. My name is James Smith, my email is james@example.com, and my phone is 202-555-0123.')
  try {
    state.actions.execute({
      conversationId: state.conversationId,
      message: 'tour',
      name: 'check_slots',
      arguments: { availability: 'Tuesday at 2pm' },
    })
    const result = state.actions.execute({
      conversationId: state.conversationId,
      message: 'tour',
      name: 'prepare_request',
      arguments: {
        kind: 'tour',
        firstName: 'James',
        lastName: 'Smith',
        email: 'james@example.com',
        phone: '202-555-0123',
        slot: '2026-11-10T19:00:00Z',
        address: null,
        preferredTime: null,
      },
    })
    assert.equal(result.ok, true)
    assert.equal(JSON.parse(state.store.pending(state.conversationId)!.details).slot, '2026-11-10T14:00:00.000-05:00')
  }
  finally { state.store.close() }
})
