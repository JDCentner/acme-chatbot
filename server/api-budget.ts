import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'

const TOKENS_PER_MILLION = 1_000_000
const INPUT_OVERHEAD_TOKENS = 2048
const USAGE_RATES = {
  'gpt-6-luna': { input: 0.20, output: 1 },
  'gpt-6.1-sol': { input: 4, output: 20 },
} as const
const ledgerSchema = z.object({
  chargedUsd: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
})
const requestSchema = z.object({
  model: z.enum(['gpt-6-luna', 'gpt-6.1-sol']),
  max_output_tokens: z.number().positive(),
  stream: z.literal(false).optional(),
}).passthrough()
const usageSchema = z.object({
  usage: z.object({
    input_tokens: z.number().nonnegative(),
    output_tokens: z.number().nonnegative(),
  }),
})

interface BudgetConfiguration {
  limitUsd: number
  path?: string
  fetch: typeof globalThis.fetch
}

export function createBudgetFetch(configuration: BudgetConfiguration) {
  const { limitUsd, path, fetch: transport } = configuration
  if (!Number.isFinite(limitUsd) || limitUsd <= 0)
    throw new Error('Set a positive API_BUDGET_USD.')
  let ledger = path && existsSync(path)
    ? ledgerSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    : { chargedUsd: 0, requests: 0 }
  function save(): void {
    if (!path)
      return
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ ...ledger, limitUsd }))
  }
  const guardedFetch: typeof globalThis.fetch = async (resource, options) => {
    if (typeof options?.body !== 'string')
      throw new TypeError('The budget guard requires a JSON Responses request.')
    const request = requestSchema.parse(JSON.parse(options.body))
    const rate = USAGE_RATES[request.model]
    // Byte count overestimates text tokens. The margin also covers schema overhead.
    const inputCeiling = Buffer.byteLength(options.body) + INPUT_OVERHEAD_TOKENS
    const reservation = (inputCeiling * rate.input + request.max_output_tokens * rate.output) / TOKENS_PER_MILLION
    if (ledger.chargedUsd + reservation > limitUsd)
      throw new Error('The local API spending limit was reached. No request was sent.')
    ledger = { chargedUsd: ledger.chargedUsd + reservation, requests: ledger.requests + 1 }
    save()
    const response = await transport(resource, options)
    if (!response.ok)
      return response
    const payload: unknown = await response.clone().json()
    const result = usageSchema.safeParse(payload)
    if (!result.success)
      return response
    const cost = (result.data.usage.input_tokens * rate.input + result.data.usage.output_tokens * rate.output) / TOKENS_PER_MILLION
    ledger.chargedUsd = ledger.chargedUsd - reservation + Math.max(cost, 0)
    save()
    return response
  }
  return {
    fetch: guardedFetch,
    summary: () => ({ ...ledger, limitUsd }),
  }
}
