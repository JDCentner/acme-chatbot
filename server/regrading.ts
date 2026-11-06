import type { ModelProvider } from './contracts.ts'
import type { Store } from './store.ts'
import { DateTime } from 'luxon'
import { z } from 'zod'
import { gradeSnapshot } from './grading.ts'
import { HttpError } from './service.ts'

const savedEvaluationSchema = z.object({
  id: z.uuid(),
  input: z.record(z.string(), z.unknown()),
  facts: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  transcript: z.array(z.object({
    user: z.string(),
    assistant: z.string(),
    audit: z.object({
      tools: z.array(z.object({
        name: z.string(),
        ok: z.boolean(),
        result: z.unknown(),
      })).optional(),
      error: z.string().optional(),
    }).passthrough(),
  })).min(1),
}).passthrough()

export async function regradeSavedRun(input: { store: Store, provider: ModelProvider, id: string, batchId: string }) {
  const { store, provider, id, batchId } = input
  if (provider.mode !== 'live')
    throw new HttpError(400, 'Saved replies need a live grader. No chat tools will run.')
  const saved = store.evaluation(id)
  if (!saved)
    throw new HttpError(404, 'Evaluation not found.')
  const source = savedEvaluationSchema.parse(saved)
  const started = performance.now()
  let result: Awaited<ReturnType<typeof gradeSnapshot>> | undefined
  let graderError: string | null = null
  try {
    result = await gradeSnapshot({
      store,
      provider,
      snapshot: {
        facts: source.facts,
        evaluationDate: DateTime.fromISO(source.createdAt).setZone('America/New_York').toISODate()!,
        transcript: source.transcript.map(turn => ({ user: turn.user, assistant: turn.assistant, tools: turn.audit.tools || [] })),
      },
    })
  }
  catch (error) {
    graderError = error instanceof Error
      ? error.message
      : 'Grading failed.'
  }
  const hasPipelineError = source.transcript.some(turn => turn.audit.error)
  return store.saveRun({
    ...saved,
    input: { ...source.input, batchId },
    sourceRunId: id,
    runType: 'regrade',
    modelGrade: result?.modelGrade || null,
    grading: result?.grading || null,
    models: { ...(saved.models as object), grader: provider.models.grader },
    reasoning: { ...(saved.reasoning as object), grader: provider.reasoning?.grader },
    status: graderError || hasPipelineError
      ? 'error'
      : Object.values(result!.modelGrade).every(criterion => criterion.passed)
        ? 'pass'
        : 'fail',
    graderError,
    durationMs: Math.round(performance.now() - started),
  })
}
