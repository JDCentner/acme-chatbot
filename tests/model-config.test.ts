import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readModelConfiguration } from '../server/model-config.ts'

test('chat roles use Luna and the separate grader uses Sol', () => {
  const configuration = readModelConfiguration({})
  assert.deepEqual(configuration.models, {
    agent: 'gpt-6-luna',
    classifier: 'gpt-6-luna',
    reviewer: 'gpt-6-luna',
    grader: 'gpt-6.1-sol',
  })
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
