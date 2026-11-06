import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setDefaultOpenAIClient } from '@openai/agents'
import OpenAI from 'openai'
import { createBudgetFetch } from '../server/api-budget.ts'
import { BASELINE_PROMPT } from '../server/baseline-prompt.ts'
import { COMMUNITY_FACTS } from '../server/facts.ts'
import { LiveProvider } from '../server/models.ts'

test('actual SDK runner sends the exact baseline and only transcript data through the budget client', async () => {
  let sent: Record<string, unknown> | undefined
  const budget = createBudgetFetch({
    limitUsd: 1,
    fetch: async (_resource, options) => {
      sent = JSON.parse(String(options?.body))
      return Response.json({
        id: 'resp_offline',
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: 'gpt-6-luna',
        output: [
          {
            id: 'msg_offline',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              { type: 'output_text', text: '850-445-8362', annotations: [] },
            ],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      })
    },
  })
  setDefaultOpenAIClient(new OpenAI({ apiKey: 'offline-test-key', maxRetries: 0, fetch: budget.fetch }))
  const result = await new LiveProvider().respond({
    variant: 'baseline',
    context: {
      facts: COMMUNITY_FACTS,
      now: '2099-01-01',
      messages: [
        { role: 'user', content: 'Phone only, please.' },
      ],
      tools: [],
      pending: { hidden: true },
    },
    execute: () => { throw new Error('No tool call was expected.') },
  })
  assert.equal(result.text, '850-445-8362')
  assert.equal(sent?.instructions, BASELINE_PROMPT)
  assert.ok(!JSON.stringify(sent?.input).includes('2099-01-01'))
  assert.ok(!JSON.stringify(sent?.input).includes('hidden'))
  assert.equal(sent?.max_output_tokens, 2000)
  assert.equal(budget.summary().requests, 1)
  assert.ok(result.history?.length)
})
