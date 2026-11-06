import type { ModelProvider } from '../server/contracts.ts'
import type { GradingSnapshot } from '../server/grading.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TASK_DOCUMENT, TASK_REQUIREMENTS } from '../server/grading-rubric.ts'
import { gradeSnapshot, gradingInput } from '../server/grading.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

const snapshot: GradingSnapshot = {
  facts: { phone: '850-445-8362' },
  evaluationDate: '2026-11-05',
  transcript: [
    { user: 'Only the phone number, please.', assistant: '850-445-8362', tools: [] },
  ],
}
function passing() {
  return {
    advisories: [],
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
      reasons: ['No previous turn.'],
      evidence: [],
    },
  }
}
function provider(grade: ModelProvider['grade']): ModelProvider {
  const fixture = new FakeProvider()
  return {
    ...fixture,
    mode: 'live',
    models: fixture.models,
    classify: fixture.classify,
    review: fixture.review,
    draft: fixture.draft,
    grade,
  }
}

test('each grading rule quotes the task document exactly', () => {
  for (const requirement of TASK_REQUIREMENTS)
    assert.ok(TASK_DOCUMENT.includes(requirement.quote), requirement.id)
})

test('task grading receives source requirements instead of planning expectations', () => {
  const input = gradingInput(snapshot)
  assert.equal(input.taskDocument, TASK_DOCUMENT)
  assert.equal('expectations' in input, false)
  assert.equal('codeChecks' in input, false)
  assert.equal('variant' in input, false)
})

test('identical evidence shares one grade across concurrent requests', async () => {
  const store = new Store(':memory:')
  let calls = 0
  const grader = provider(async () => {
    calls++
    return passing()
  })
  try {
    const inputs = { store, provider: grader, snapshot }
    const [first, second] = await Promise.all([
      gradeSnapshot(inputs),
      gradeSnapshot(inputs),
    ])
    assert.equal(calls, 1)
    assert.deepEqual(first.modelGrade, second.modelGrade)
    assert.equal((await gradeSnapshot(inputs)).grading.cacheHit, true)
  }
  finally { store.close() }
})

test('calibration can repeat uncached grader calls', async () => {
  const store = new Store(':memory:')
  let calls = 0
  const grader = provider(async () => {
    calls++
    return passing()
  })
  try {
    await gradeSnapshot({
      store,
      provider: grader,
      snapshot,
      useCache: false,
    })
    await gradeSnapshot({
      store,
      provider: grader,
      snapshot,
      useCache: false,
    })
    assert.equal(calls, 2)
  }
  finally { store.close() }
})

test('a failed criterion without source evidence is a grader error', async () => {
  const store = new Store(':memory:')
  try {
    const grade = passing()
    grade.factualSupport.passed = false
    await assert.rejects(gradeSnapshot({
      store,
      provider: provider(async () => grade),
      snapshot,
    }), /source and reply evidence/)
  }
  finally { store.close() }
})

test('invented reply evidence is rejected', async () => {
  const store = new Store(':memory:')
  try {
    const grade = {
      ...passing(),
      factualSupport: {
        passed: false,
        reasons: ['Bad price.'],
        evidence: [
          { requirementId: 'accuracy', turn: 1, quote: 'Living here is free.' },
        ],
      },
    }
    await assert.rejects(gradeSnapshot({
      store,
      provider: provider(async () => grade),
      snapshot,
    }), /not displayed/)
  }
  finally { store.close() }
})

test('a changed grader model cannot reuse the earlier grade', async () => {
  const store = new Store(':memory:')
  let calls = 0
  const grader = provider(async () => {
    calls++
    return passing()
  })
  try {
    await gradeSnapshot({ store, provider: grader, snapshot })
    await gradeSnapshot({
      store,
      provider: {
        ...grader,
        models: { ...grader.models, grader: 'another-grader' },
      },
      snapshot,
    })
    assert.equal(calls, 2)
  }
  finally { store.close() }
})

test('a style advisory is retained without changing the task grade', async () => {
  const store = new Store(':memory:')
  try {
    const assessment = {
      ...passing(),
      advisories: [
        {
          requirementId: 'close-request',
          turn: 1,
          quote: '850-445-8362',
          reason: 'No optional closing question.',
        },
      ],
    }
    const result = await gradeSnapshot({
      store,
      provider: provider(async () => assessment),
      snapshot,
    })
    assert.equal(result.modelGrade.usefulAnswer.passed, true)
    assert.equal(result.grading.advisories.length, 1)
  }
  finally { store.close() }
})

test('an accuracy failure cannot be represented as a style advisory', async () => {
  const store = new Store(':memory:')
  try {
    const assessment = {
      ...passing(),
      advisories: [
        {
          requirementId: 'accuracy',
          turn: 1,
          quote: '850-445-8362',
          reason: 'Wrong number.',
        },
      ],
    }
    await assert.rejects(gradeSnapshot({
      store,
      provider: provider(async () => assessment),
      snapshot,
    }))
  }
  finally { store.close() }
})
