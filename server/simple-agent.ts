import type { AgentInputItem, ModelSettings } from '@openai/agents'
import type { ModelContext } from './contracts.ts'
import type { Variant } from './models.ts'
import type { Turn } from './store.ts'
import { Agent, tool } from '@openai/agents'
import { z } from 'zod'
import { BASELINE_PROMPT } from './baseline-prompt.ts'
import { BETTER_PROMPT } from './simple-prompt.ts'

interface SimpleAgentInput {
  variant: Variant
  model: string
  modelSettings: ModelSettings
  context: ModelContext
  history?: AgentInputItem[]
  execute: (name: string, arguments_: unknown) => unknown
}

export function buildSimpleAgent(input: SimpleAgentInput) {
  const instructions = input.variant === 'baseline'
    ? BASELINE_PROMPT
    : `${BETTER_PROMPT}\nCurrent server time in America/New_York: ${input.context.now}\nCommunity facts:\n${JSON.stringify(input.context.facts)}`
  const tools = [
    tool({
      name: 'check_slots',
      description: 'Look up available one-hour tour slots for a calendar date. Supply YYYY-MM-DD. Returns local mock inventory.',
      parameters: z.object({
        date: z.string(),
      }),
      execute: arguments_ => input.execute('check_slots', arguments_),
    }),
    tool({
      name: 'save_request',
      description: 'Save a local mock tour, callback, or brochure request. Required fields must be complete. Does not contact staff or send material.',
      parameters: z.object({
        kind: z.enum(['tour', 'callback', 'brochure']),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string(),
        slot: z.string().nullable(),
        preferredTime: z.string().nullable(),
        address: z.string().nullable(),
      }),
      execute: arguments_ => input.execute('save_request', arguments_),
    }),
  ]
  return {
    agent: new Agent({
      name: `Sophie ${input.variant}`,
      instructions,
      model: input.model,
      modelSettings: input.modelSettings,
      tools,
    }),
    messages: input.history ?? input.context.messages.map(message => message.role === 'user'
      ? { role: 'user', content: message.content }
      : {
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: message.content },
          ],
        }) as AgentInputItem[],
  }
}

export function replayHistory(turns: Turn[]): AgentInputItem[] {
  let history: AgentInputItem[] = []
  for (const turn of turns) {
    const audit = JSON.parse(turn.audit)
    if (Array.isArray(audit.history)) {
      history = audit.history
      continue
    }
    history.push({ role: 'user', content: turn.input })
    if (turn.reply) {
      history.push({
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: turn.reply },
        ],
      })
    }
  }
  return history
}
