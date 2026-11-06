import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readModelConfiguration } from '../server/model-config.ts'

test('all model roles default to Luna', () => {
  const configuration = readModelConfiguration({})
  assert.ok(Object.values(configuration.models).every(model => model === 'gpt-6-luna'))
})

test('chat roles use low reasoning and grading uses medium reasoning', () => {
  assert.deepEqual(readModelConfiguration({}).reasoning, {
    agent: 'low',
    classifier: 'low',
    reviewer: 'low',
    grader: 'medium',
  })
})

test('explicit model and reasoning settings override defaults', () => {
  const configuration = readModelConfiguration({ AGENT_MODEL: 'custom-model', AGENT_REASONING_EFFORT: 'high' })
  assert.equal(configuration.models.agent, 'custom-model')
  assert.equal(configuration.reasoning.agent, 'high')
})

test('invalid reasoning settings fail before a model call', () => {
  assert.throws(() => readModelConfiguration({ REVIEW_REASONING_EFFORT: 'invalid' }))
})
