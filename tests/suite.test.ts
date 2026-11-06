import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { evaluationSchema } from '../server/evaluations.ts'

const REFERENCE_INPUTS_SHA256 = '44159b5d157c3dde0dcd6ddcb4c1b5b6db888084480b3b2aff04f04c503676be'

const require = createRequire(import.meta.resolve('promptfoo'))
const yaml = require('yaml') as { parse: (text: string) => Array<{ description: string, metadata: { source: string, category: string }, vars: Record<string, string> }> }

const cases = [
  'cases.yaml',
  'generated.yaml',
  'workflows.yaml',
  'conversations.yaml',
  'task-goals.yaml',
].flatMap(file => yaml.parse(readFileSync(`evals/${file}`, 'utf8')))

test('first ten reference inputs keep their original text and order', () => {
  const actual = cases.slice(0, 10).map(entry => (JSON.parse(entry.vars.messages) as string[]).at(-1))
  assert.equal(actual.length, 10)
  assert.equal(createHash('sha256').update(JSON.stringify(actual)).digest('hex'), REFERENCE_INPUTS_SHA256)
})

test('added cases are marked as generated rather than task examples', () => {
  assert.ok(cases.slice(0, 10).every(entry => entry.metadata.source === 'task'))
  assert.ok(cases.slice(10).every(entry => entry.metadata.source === 'generated'))
})

test('all 43 cases have unique IDs and valid evaluation payloads', () => {
  assert.equal(cases.length, 43)
  assert.equal(new Set(cases.map(entry => entry.vars.caseId)).size, cases.length)
  for (const entry of cases) {
    assert.ok(evaluationSchema.safeParse({
      ...entry.vars,
      variant: 'single',
      messages: JSON.parse(entry.vars.messages),
      expectedRequests: JSON.parse(entry.vars.expectedRequests),
    }).success, entry.description)
  }
})

test('generated coverage includes single turns, longer dialogues, and jailbreaks', () => {
  const generated = cases.slice(10)
  assert.ok(generated.some(entry => JSON.parse(entry.vars.messages).length === 1))
  assert.ok(generated.some(entry => JSON.parse(entry.vars.messages).length >= 8))
  assert.ok(generated.filter(entry => entry.metadata.category === 'jailbreak').length >= 5)
})

test('complex jailbreak spans ten turns and returns to a normal community question', () => {
  const entry = cases.find(entry => entry.vars.caseId === 'G43')!
  const messages = JSON.parse(entry.vars.messages) as string[]
  assert.equal(messages.length, 10)
  assert.ok(messages.every(message => message.length <= 4000))
  assert.match(messages.at(-1)!, /Assisted Living.*car/)
  assert.equal(entry.metadata.category, 'complex-jailbreak')
})
