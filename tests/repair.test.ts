import type { ModelProvider } from '../server/contracts.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { FALLBACK_REPLY } from '../server/contracts.ts'
import { ConversationService } from '../server/service.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

function fixture(changes: Partial<ModelProvider>) {
  const original = new FakeProvider()
  const provider: ModelProvider = {
    mode: 'fake',
    models: original.models,
    classify: original.classify.bind(original),
    draft: original.draft.bind(original),
    review: original.review.bind(original),
    grade: original.grade.bind(original),
    ...changes,
  }
  const store = new Store(':memory:')
  const conversation = store.createConversation()
  const service = new ConversationService(store, provider)
  return {
    store,
    conversation,
    send: (message: string) => service.submit(conversation.id, {
      message,
      requestId: randomUUID(),
    }) as Promise<{ reply: string }>,
  }
}

test('a corrected reply is displayed only after another review', async () => {
  let reviews = 0
  const state = fixture({
    review: async () => ({
      approved: ++reviews === 2,
      reasons: ['Reference verdict.'],
    }),
    repair: async () => 'Residents can have cars, and parking is available.',
  })
  try {
    const result = await state.send('Can my dad bring his car?')
    assert.equal(result.reply, 'Residents can have cars, and parking is available.')
    const audit = JSON.parse(state.store.turns(state.conversation.id)[0].audit)
    assert.equal(audit.review.approved, false)
    assert.equal(audit.repairReview.approved, true)
    assert.ok(audit.draft)
  }
  finally { state.store.close() }
})

test('a second rejection returns the fixed fallback', async () => {
  let repairs = 0
  const state = fixture({
    review: async () => ({
      approved: false,
      reasons: ['Unsupported.'],
    }),
    repair: async () => {
      repairs++
      return 'An unsupported correction.'
    },
  })
  try {
    assert.equal((await state.send('Can my dad bring his car?')).reply, FALLBACK_REPLY)
    assert.equal(repairs, 1)
  }
  finally { state.store.close() }
})

test('reply correction does not repeat a completed callback save', async () => {
  let shouldCorrect = false
  let reviews = 0
  const state = fixture({
    review: async () => ({
      approved: !shouldCorrect || ++reviews === 2,
      reasons: ['Reference verdict.'],
    }),
    repair: async () => 'Your local callback request is saved. No staff were contacted.',
  })
  try {
    for (const message of [
      'I want a callback',
      'James',
      'Smith',
      'james@example.com',
      '202-555-0123',
      'tomorrow at 2pm',
    ])
      await state.send(message)
    shouldCorrect = true
    await state.send('confirm')
    assert.equal(state.store.requests().length, 1)
    const audit = JSON.parse(state.store.turns(state.conversation.id).at(-1)!.audit)
    assert.equal(audit.tools.filter((tool: { name: string }) => tool.name === 'confirm_request').length, 1)
    assert.equal(audit.repairReview.approved, true)
  }
  finally { state.store.close() }
})
