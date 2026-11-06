import type { AgentInputItem } from '@openai/agents'
import type { ModelContext } from '../server/contracts.ts'
import type { Turn } from '../server/store.ts'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { BASELINE_PROMPT } from '../server/baseline-prompt.ts'
import { BasicActions } from '../server/basic-actions.ts'
import { COMMUNITY_FACTS } from '../server/facts.ts'
import { ConversationService } from '../server/service.ts'
import { buildSimpleAgent, replayHistory } from '../server/simple-agent.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

const clock = () => new Date('2026-11-05T15:00:00Z')
const context: ModelContext = {
  facts: COMMUNITY_FACTS,
  now: '2026-11-05T10:00:00.000-05:00',
  messages: [
    { role: 'user', content: 'Next Tuesday at 2pm.' },
  ],
  tools: [],
  pending: { secretDerivedState: true },
  requestState: {
    checkedSlots: ['derived slot'],
    savedRequests: [],
  },
}
const details = {
  kind: 'callback',
  firstName: 'Morgan',
  lastName: 'Reed',
  email: 'morgan@example.com',
  phone: '202-555-0123',
  preferredTime: 'Tomorrow at 2pm',
  slot: null,
  address: null,
}

function definition(variant: 'baseline' | 'prompt') {
  return buildSimpleAgent({
    variant,
    context,
    model: 'fake',
    modelSettings: {},
    execute: () => undefined,
  })
}

test('true baseline runs the exact original prompt with no adapter', () => {
  const originalHash = '49a426c5ad6cfb55689cf0d13b2bc4e16a71c3b5a0483e88f6473664763ed7d6'
  assert.equal(createHash('sha256').update(BASELINE_PROMPT).digest('hex'), originalHash)
  assert.equal(definition('baseline').agent.instructions, BASELINE_PROMPT)
})

test('true baseline receives only normal transcript input', () => {
  assert.deepEqual(definition('baseline').messages, [
    { role: 'user', content: 'Next Tuesday at 2pm.' },
  ])
})

test('better prompt receives real New York time and facts in instructions', () => {
  const instructions = definition('prompt').agent.instructions as string
  assert.ok(instructions.includes(context.now))
  assert.ok(instructions.includes(JSON.stringify(COMMUNITY_FACTS)))
  assert.ok(!instructions.includes('2025-03-04'))
})

test('both simple designs expose identical basic tools', () => {
  const original = definition('baseline').agent.tools
  const improved = definition('prompt').agent.tools
  assert.deepEqual(original.map(tool => tool.name), ['check_slots', 'save_request'])
  assert.deepEqual(original.map(tool => ({
    name: tool.name,
    parameters: tool.type === 'function'
      ? tool.parameters
      : undefined,
  })), improved.map(tool => ({
    name: tool.name,
    parameters: tool.type === 'function'
      ? tool.parameters
      : undefined,
  })))
})

test('normal SDK history retains tool calls and their results across turns', () => {
  const history: AgentInputItem[] = [
    { role: 'user', content: 'A tour on 2026-11-10.' },
    {
      type: 'function_call',
      callId: 'slot-call',
      name: 'check_slots',
      arguments: '{"date":"2026-11-10"}',
    },
    {
      type: 'function_call_result',
      callId: 'slot-call',
      name: 'check_slots',
      status: 'completed',
      output: { type: 'text', text: '{"slots":[]}' },
    },
  ]
  const turns = [
    {
      input: 'A tour on 2026-11-10.',
      reply: 'No slots.',
      audit: JSON.stringify({ history }),
    },
    { input: 'What about Wednesday?', reply: null, audit: '{}' },
  ] as Turn[]
  assert.deepEqual(replayHistory(turns), [
    ...history,
    { role: 'user', content: 'What about Wednesday?' },
  ])
})

for (const variant of ['baseline', 'prompt'] as const) {
  test(`${variant} has no injected server greeting`, () => {
    const store = new Store(':memory:', clock)
    try {
      const conversation = store.createConversation(variant)
      assert.equal(conversation.greeting, '')
      assert.deepEqual(store.context(conversation.id), [])
    }
    finally { store.close() }
  })

  test(`${variant} skips classification and response review`, async () => {
    const store = new Store(':memory:', clock)
    const provider = new FakeProvider()
    provider.classify = async () => {
      throw new Error('Classifier must not run.')
    }
    provider.review = async () => {
      throw new Error('Reviewer must not run.')
    }
    provider.draft = async () => ({ text: '850-445-8362', tools: [] })
    try {
      const conversation = store.createConversation(variant)
      const reply = await new ConversationService(store, provider).submit(conversation.id, {
        message: 'Your phone number?',
        requestId: randomUUID(),
      }, variant)
      assert.equal((reply as { reply: string }).reply, '850-445-8362')
    }
    finally { store.close() }
  })
}

test('basic slots require an absolute calendar date without resolving relative words', () => {
  const store = new Store(':memory:', clock)
  try {
    const result = new BasicActions(store).execute({
      conversationId: store.createConversation('baseline').id,
      name: 'check_slots',
      arguments: { date: 'Tuesday' },
    })
    assert.equal(result.ok, false)
  }
  finally { store.close() }
})

test('basic tools do not silently replace the original prompt stale date', () => {
  const store = new Store(':memory:', clock)
  try {
    const result = new BasicActions(store).execute({
      conversationId: store.createConversation('baseline').id,
      name: 'check_slots',
      arguments: { date: '2025-03-11' },
    })
    assert.deepEqual((result.result as { slots: string[] }).slots, [])
  }
  finally { store.close() }
})

test('basic save validates required contact fields', () => {
  const store = new Store(':memory:', clock)
  try {
    const result = new BasicActions(store).execute({
      conversationId: store.createConversation('baseline').id,
      name: 'save_request',
      arguments: { ...details, phone: '' },
    })
    assert.equal(result.ok, false)
    assert.equal(store.requests().length, 0)
  }
  finally { store.close() }
})

test('basic saves do not acquire guarded source or confirmation checks', () => {
  const store = new Store(':memory:', clock)
  try {
    const result = new BasicActions(store).execute({ conversationId: store.createConversation('baseline').id, name: 'save_request', arguments: details })
    assert.equal(result.ok, true)
    assert.equal(store.requests().length, 1)
    assert.equal(store.database.prepare('SELECT status FROM pending_requests').get()?.status, 'basic_saved')
  }
  finally { store.close() }
})

test('repeated basic saves create one record', () => {
  const store = new Store(':memory:', clock)
  try {
    const actions = new BasicActions(store)
    const input = { conversationId: store.createConversation('baseline').id, name: 'save_request', arguments: details }
    actions.execute(input)
    const repeated = actions.execute(input)
    assert.equal((repeated.result as { status: string }).status, 'already_saved')
    assert.equal(store.requests().length, 1)
  }
  finally { store.close() }
})

test('competing basic bookings cannot save the same slot twice', () => {
  const store = new Store(':memory:', clock)
  try {
    const actions = new BasicActions(store)
    const request = {
      ...details,
      kind: 'tour',
      slot: '2026-11-10T14:00:00.000-05:00',
      preferredTime: null,
    }
    assert.equal(actions.execute({ conversationId: store.createConversation('baseline').id, name: 'save_request', arguments: request }).ok, true)
    assert.equal(actions.execute({ conversationId: store.createConversation('prompt').id, name: 'save_request', arguments: request }).ok, false)
    assert.equal(store.requests().length, 1)
  }
  finally { store.close() }
})
