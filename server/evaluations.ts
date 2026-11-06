import type { ModelProvider } from './contracts.ts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { gradeSchema } from './contracts.ts'
import { bounded, variantSchema } from './models.ts'
import { ConversationService, HttpError } from './service.ts'
import { Store } from './store.ts'

export const evaluationSchema = z.object({
  variant: variantSchema,
  messages: z.array(z.string().min(1).max(4000)).min(1).max(20),
  expectations: z.string().min(1).max(3000),
  expectedRequests: z.array(z.object({
    kind: z.enum(['tour', 'callback', 'brochure']),
    email: z.email().optional(),
  }).strict()).max(3).optional(),
}).strict()

export async function evaluate(store: Store, provider: ModelProvider, body: unknown): Promise<unknown> {
  const parsed = evaluationSchema.safeParse(body)
  if (!parsed.success)
    throw new HttpError(400, 'Provide a variant, messages, and expectations.')
  const input = parsed.data
  const sandbox = new Store(':memory:', store.clock)
  const started = performance.now()
  try {
    const service = new ConversationService(sandbox, provider)
    const conversation = sandbox.createConversation()
    for (const message of input.messages) {
      await service.submit(conversation.id, {
        message,
        requestId: randomUUID(),
      }, input.variant)
    }
    const turns = sandbox.turns(conversation.id)
    const transcript = turns.map(turn => ({
      user: turn.input,
      assistant: turn.reply,
      audit: JSON.parse(turn.audit),
    }))
    const hasErrors = transcript.some(turn => turn.audit.error)
    const requests = sandbox.requests()
    const duplicateCount = requests.length - new Set(requests.map(request => request.pending_id)).size
    const requestOutcomesMatch = input.expectedRequests === undefined || (requests.length === input.expectedRequests.length && input.expectedRequests.every((expected, index) => {
      const actual = requests[index]
      const details = JSON.parse(actual.details)
      return actual.kind === expected.kind && (expected.email === undefined || details.email === expected.email)
    }))
    const codeChecks = { noDuplicateRequests: duplicateCount === 0, noPipelineErrors: !hasErrors, requestOutcomesMatch }
    let modelGrade: unknown = null
    let graderError: string | null = null
    if (provider.mode === 'live') {
      try {
        modelGrade = gradeSchema.parse(await bounded(provider.grade({
          transcript: transcript.map((turn, index) => ({
            turn: index + 1,
            user: turn.user,
            assistant: turn.assistant,
            tools: turn.audit.tools || [],
          })),
          facts: sandbox.facts(),
          expectations: input.expectations,
          requests,
          codeChecks,
        })))
      }
      catch (error) {
        graderError = error instanceof Error
          ? error.message
          : 'Grading failed.'
      }
    }
    const status = provider.mode === 'fake'
      ? 'fixture_only'
      : graderError || hasErrors
        ? 'error'
        : Object.values(modelGrade as z.infer<typeof gradeSchema>).every(criterion => criterion.passed) && Object.values(codeChecks).every(Boolean)
          ? 'pass'
          : 'fail'
    return store.saveRun({
      input,
      transcript,
      facts: sandbox.facts(),
      expectations: input.expectations,
      codeChecks,
      modelGrade,
      graderError,
      status,
      mode: provider.mode,
      models: provider.models,
      reasoning: provider.reasoning,
      durationMs: Math.round(performance.now() - started),
      requests,
    })
  }
  finally {
    sandbox.close()
  }
}
