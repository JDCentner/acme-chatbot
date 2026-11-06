import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBudgetFetch } from '../server/api-budget.ts'

const request = {
  method: 'POST',
  body: JSON.stringify({ model: 'gpt-6.1-sol', max_output_tokens: 6000, input: 'Hello' }),
}
function success() {
  return Response.json({
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

test('budget limit stops a call before the transport runs', async () => {
  let calls = 0
  const guard = createBudgetFetch({
    limitUsd: 0.01,
    fetch: async () => {
      calls++
      return success()
    },
  })
  await assert.rejects(guard.fetch('https://api.openai.com/v1/responses', request), /No request was sent/)
  assert.equal(calls, 0)
})

test('completed calls charge usage at conservative rates', async () => {
  const guard = createBudgetFetch({
    limitUsd: 1,
    fetch: async () => success(),
  })
  await guard.fetch('https://api.openai.com/v1/responses', request)
  assert.ok(Math.abs(guard.summary().chargedUsd - 0.0014) < 0.000001)
})

test('failed calls retain the full reservation without retry', async () => {
  let calls = 0
  const guard = createBudgetFetch({
    limitUsd: 1,
    fetch: async () => {
      calls++
      throw new Error('Network failure')
    },
  })
  await assert.rejects(guard.fetch('https://api.openai.com/v1/responses', request), /Network failure/)
  assert.equal(calls, 1)
  assert.ok(guard.summary().chargedUsd >= 0.12)
})

test('parallel requests reserve spending before either response returns', async () => {
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const guard = createBudgetFetch({
    limitUsd: 0.2,
    fetch: async () => {
      await waiting
      return success()
    },
  })
  const first = guard.fetch('https://api.openai.com/v1/responses', request)
  await assert.rejects(guard.fetch('https://api.openai.com/v1/responses', request), /spending limit/)
  release!()
  await first
})

test('budget charges survive a server restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'acme-budget-'))
  const path = join(directory, 'ledger.json')
  try {
    const initial = createBudgetFetch({
      limitUsd: 1,
      path,
      fetch: async () => success(),
    })
    await initial.fetch('https://api.openai.com/v1/responses', request)
    const restarted = createBudgetFetch({
      limitUsd: 1,
      path,
      fetch: async () => success(),
    })
    assert.deepEqual(restarted.summary(), initial.summary())
  }
  finally { rmSync(directory, { recursive: true }) }
})

test('an unpriced model cannot bypass the spending guard', async () => {
  let calls = 0
  const guard = createBudgetFetch({
    limitUsd: 1,
    fetch: async () => {
      calls++
      return success()
    },
  })
  await assert.rejects(guard.fetch('https://api.openai.com/v1/responses', {
    ...request,
    body: JSON.stringify({ model: 'other', max_output_tokens: 2000 }),
  }))
  assert.equal(calls, 0)
})
