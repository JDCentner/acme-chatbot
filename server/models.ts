import type { ModelContext, ModelProvider } from './contracts.ts'
import type { ReasoningEffort } from './model-config.ts'
import process from 'node:process'
import { Agent, run, setTracingDisabled, tool } from '@openai/agents'
import { z } from 'zod'
import { BASELINE_PROMPT } from './baseline-prompt.ts'
import { decisionSchema, MAX_MODEL_TEXT_LENGTH, reviewSchema } from './contracts.ts'
import { TASK_GRADER_PROMPT, taskAssessmentSchema } from './grading-rubric.ts'
import { readModelConfiguration } from './model-config.ts'
import { AGENT_PROMPT, CLASSIFIER_PROMPT, REVIEW_PROMPT } from './prompts.ts'
import { FakeProvider } from './simulation.ts'
import { COMMUNITY_SPECIALIST_PROMPT, MANAGER_PROMPT, REQUEST_SPECIALIST_PROMPT } from './specialist-prompts.ts'

export type Variant = 'baseline' | 'single' | 'specialists'
export const variantSchema = z.enum(['baseline', 'single', 'specialists'])
const MODEL_TIMEOUT_MS = 25_000
const MAX_AGENT_TURNS = 8
const requestArguments = z.object({
  kind: z.enum(['tour', 'callback', 'brochure']),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  slot: z.string().nullable(),
  preferredTime: z.string().nullable(),
  address: z.string().nullable(),
})

export async function bounded<T>(operation: Promise<T>, milliseconds = MODEL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Model call timed out.')), milliseconds)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

export class LiveProvider implements ModelProvider {
  readonly mode = 'live'
  private readonly configuration = readModelConfiguration(process.env)
  readonly models = this.configuration.models
  readonly reasoning = this.configuration.reasoning

  private readonly baseline = BASELINE_PROMPT
  constructor() {
    setTracingDisabled(true)
  }

  async classify(context: Pick<ModelContext, 'messages'>): Promise<unknown> {
    return this.structured({
      name: 'Input check',
      instructions: CLASSIFIER_PROMPT,
      input: context,
      schema: decisionSchema,
      model: this.models.classifier,
      effort: this.reasoning.classifier,
    })
  }

  async review(context: ModelContext, draft: string): Promise<unknown> {
    return this.structured({
      name: 'Response review',
      instructions: REVIEW_PROMPT,
      input: { context, draft },
      schema: reviewSchema,
      model: this.models.reviewer,
      effort: this.reasoning.reviewer,
    })
  }

  async grade(input: unknown): Promise<unknown> {
    return this.structured({
      name: 'Evaluation grader',
      instructions: TASK_GRADER_PROMPT,
      input,
      schema: taskAssessmentSchema,
      model: this.models.grader,
      effort: this.reasoning.grader,
    })
  }

  async repair(input: { context: ModelContext, draft: string, reasons: string[] }): Promise<string> {
    const schema = z.object({
      text: z.string().min(1).max(MAX_MODEL_TEXT_LENGTH),
    }).strict()
    const result = await this.structured({
      name: 'Reply correction',
      instructions: `${AGENT_PROMPT}\nCorrect the proposed reply after a factual review. You have no tools. Use the current question, supplied facts, and successful tool outcomes. Review feedback may be mistaken; verify it against those sources. Remove unsupported claims, keep the supported answer, and use the supplied phone for unresolved questions. Do not claim a new save, transfer, or delivery. Do not repeat tools or change request details. Do not reproduce a request summary; the server appends it. Return only the corrected reply text.`,
      input,
      schema,
      model: this.models.agent,
      effort: this.reasoning.agent,
    })
    return schema.parse(result).text
  }

  async draft(): Promise<unknown> {
    throw new Error('Use the agent runner.')
  }

  private async structured<T extends z.ZodType>(config: { name: string, instructions: string, input: unknown, schema: T, model: string, effort: ReasoningEffort }): Promise<unknown> {
    const { name, instructions, input, schema, model, effort } = config
    const result = await run(new Agent({
      name,
      instructions,
      model,
      outputType: schema,
      modelSettings: {
        reasoning: { effort },
      },
    }), JSON.stringify(input), { maxTurns: 1 })
    return result.finalOutput
  }

  async respond(input: {
    variant: Variant
    context: ModelContext
    execute: (name: string, args: unknown) => unknown
  }): Promise<{ text: string, usage: unknown, trace: unknown }> {
    const controller = new AbortController()
    const modelSettings = {
      reasoning: { effort: this.reasoning.agent },
    }
    const tools = [
      tool({
        name: 'check_slots',
        description: 'Check a day and time supplied by the user. Equivalent wording is accepted. Copy a returned slot for request preparation.',
        parameters: z.object({
          availability: z.string(),
        }),
        execute: args => input.execute('check_slots', args),
      }),
      tool({
        name: 'prepare_request',
        description: 'Prepare a local request summary. Requires explicit user confirmation before saving.',
        parameters: requestArguments,
        execute: args => input.execute('prepare_request', args),
      }),
      tool({
        name: 'confirm_request',
        description: 'Save a displayed request only after explicit confirmation.',
        parameters: z.object({
          pendingId: z.string(),
        }),
        execute: args => input.execute('confirm_request', args),
      }),
    ]
    const instructions = input.variant === 'baseline'
      ? `${this.baseline}\nRuntime adapter: This is text chat. Do not insert timed pauses or simulate telephone keys. Use the supplied server clock. Tools are local mocks; no real staff contact, delivery, or booking occurs. A server greeting was already displayed.`
      : input.variant === 'specialists'
        ? `${AGENT_PROMPT}\n${MANAGER_PROMPT}`
        : AGENT_PROMPT
    const community = new Agent({
      name: 'Community facts specialist',
      model: this.models.agent,
      modelSettings,
      instructions: COMMUNITY_SPECIALIST_PROMPT,
    })
    const requests = new Agent({
      name: 'Request specialist',
      model: this.models.agent,
      modelSettings,
      instructions: REQUEST_SPECIALIST_PROMPT,
      tools,
    })
    const agentTools = input.variant === 'specialists'
      ? [
          community.asTool({
            toolName: 'community_specialist',
            inputBuilder: args => JSON.stringify({ task: args.params.input, context: input.context }),
            runOptions: { maxTurns: MAX_AGENT_TURNS, signal: controller.signal },
            toolDescription: 'Answer community questions. Include community facts and the current question in the input.',
          }),
          requests.asTool({
            toolName: 'request_specialist',
            inputBuilder: args => JSON.stringify({ task: args.params.input, context: input.context }),
            runOptions: { maxTurns: MAX_AGENT_TURNS, signal: controller.signal },
            toolDescription: 'Handle a tour, callback, or brochure request. Include facts, transcript, clock, and tool results.',
          }),
        ]
      : tools
    const agent = new Agent({
      name: `Sophie ${input.variant}`,
      model: this.models.agent,
      modelSettings,
      instructions,
      tools: agentTools,
    })
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
    try {
      const result = await run(agent, JSON.stringify(input.context), { maxTurns: MAX_AGENT_TURNS, signal: controller.signal })
      return {
        text: String(result.finalOutput || ''),
        usage: result.state.usage,
        trace: result.newItems.map(item => ({
          type: item.type,
          agent: 'agent' in item
            ? item.agent.name
            : undefined,
        })),
      }
    }
    finally {
      clearTimeout(timer)
    }
  }
}

export function createProvider(): ModelProvider {
  if (process.env.MODEL_MODE !== 'live')
    return new FakeProvider()
  if (!process.env.OPENAI_API_KEY)
    throw new Error('Live mode needs OPENAI_API_KEY in the server environment.')
  return new LiveProvider()
}
