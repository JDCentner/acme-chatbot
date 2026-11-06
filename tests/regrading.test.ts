import type { ModelProvider } from '../server/contracts.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { regradeSavedRun } from '../server/regrading.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

function savedEvaluation(store: Store) {
  return store.saveRun({
    input: {
      variant: 'single',
      messages: ['Can he bring his car?'],
      batchId: 'original',
    },
    facts: store.facts(),
    transcript: [
      {
        user: 'Can he bring his car?',
        assistant: 'Residents can have cars.',
        audit: { tools: [] },
      },
    ],
    models: { agent: 'original-agent', grader: 'original-grader' },
    requests: [],
  })
}
function grader(grade: ModelProvider['grade']): ModelProvider {
  const fixture = new FakeProvider()
  const rejectChat = async () => {
    throw new Error('Regrading must not run chat or tools.')
  }
  return {
    mode: 'live',
    models: fixture.models,
    classify: rejectChat,
    review: rejectChat,
    draft: rejectChat,
    grade,
  }
}

test('regrading saves a linked result without replaying the conversation', async () => {
  const store = new Store(':memory:')
  const source = savedEvaluation(store)
  const sourceBefore = store.evaluation(String(source.id))
  try {
    const result = await regradeSavedRun({
      store,
      id: String(source.id),
      batchId: 'regraded',
      provider: grader(async () => ({
        advisories: [],
        answerAccuracy: {
          passed: true,
          reasons: ['Correct answer.'],
          evidence: [],
        },
        factualSupport: {
          passed: true,
          reasons: ['Supported.'],
          evidence: [],
        },
        usefulAnswer: {
          passed: true,
          reasons: ['Answered.'],
          evidence: [],
        },
        contextUse: {
          passed: true,
          reasons: ['No prior turn.'],
          evidence: [],
        },
      })),
    })
    assert.equal(result.sourceRunId, source.id)
    assert.notEqual(result.id, source.id)
    assert.deepEqual(store.evaluation(String(source.id)), sourceBefore)
    assert.equal(store.requests().length, 0)
  }
  finally { store.close() }
})

test('a failed regrade is retained as an error instead of a pass', async () => {
  const store = new Store(':memory:')
  const source = savedEvaluation(store)
  try {
    const result = await regradeSavedRun({
      store,
      id: String(source.id),
      batchId: 'failed-regrade',
      provider: grader(async () => { throw new Error('Grader unavailable.') }),
    })
    assert.equal(result.status, 'error')
    assert.equal(result.modelGrade, null)
    assert.equal(result.graderError, 'Grader unavailable.')
    assert.equal(store.runs().length, 2)
  }
  finally { store.close() }
})
