import type { ModelProvider } from '../server/contracts.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluate } from '../server/evaluations.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

function gradingProvider(grade: ModelProvider['grade']): ModelProvider {
  const fixture = new FakeProvider()
  return {
    mode: 'live',
    models: fixture.models,
    classify: fixture.classify.bind(fixture),
    draft: fixture.draft.bind(fixture),
    review: fixture.review.bind(fixture),
    grade,
  }
}
const passingGrade = {
  factualSupport: {
    passed: true,
    reasons: ['Test verdict.'],
  },
  usefulAnswer: {
    passed: true,
    reasons: ['Test verdict.'],
  },
  contextUse: {
    passed: true,
    reasons: ['Test verdict.'],
  },
}

test('grader receives every turn in a longer conversation', async () => {
  const store = new Store(':memory:')
  let received: unknown
  const provider = gradingProvider(async (input) => {
    received = input
    return passingGrade
  })
  try {
    await evaluate(store, provider, {
      variant: 'single',
      messages: Array.from({ length: 8 }).fill('Can my dad bring his car?'),
      expectations: 'Check the complete transcript.',
      expectedRequests: [],
    })
    const input = received as { transcript: Array<{ user: string, assistant: string, audit?: unknown, draft?: unknown }>, requests: unknown[] }
    assert.equal(input.transcript.length, 8)
    assert.equal(input.transcript[0].user, 'Can my dad bring his car?')
    assert.match(input.transcript[7].assistant, /parking/)
    assert.deepEqual(input.requests, [])
    assert.ok(input.transcript.every(turn => turn.audit === undefined && turn.draft === undefined))
  }
  finally { store.close() }
})

test('missing expected request fails even when the model grader approves', async () => {
  const store = new Store(':memory:')
  try {
    const result = await evaluate(store, gradingProvider(async () => passingGrade), {
      variant: 'single',
      messages: ['Can my dad bring his car?'],
      expectations: 'A tour must be saved.',
      expectedRequests: [
        { kind: 'tour', email: 'corrected@example.com' },
      ],
    }) as { status: string, codeChecks: { requestOutcomesMatch: boolean } }
    assert.equal(result.codeChecks.requestOutcomesMatch, false)
    assert.equal(result.status, 'fail')
  }
  finally { store.close() }
})
