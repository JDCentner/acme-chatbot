import type { ModelProvider } from './contracts.ts'
import type { Variant } from './models.ts'
import type { Store } from './store.ts'
import { Router } from 'express'
import { z } from 'zod'
import { variantSchema } from './models.ts'
import { regradeSavedRun } from './regrading.ts'
import { HttpError } from './service.ts'

export function adminRoutes(config: { store: Store, provider: ModelProvider, defaultVariant: Variant }) {
  const { store, provider, defaultVariant } = config
  const router = Router()
  const settings = () => ({
    variant: store.activeVariant(defaultVariant),
    models: provider.models,
    reasoning: provider.reasoning,
    mode: provider.mode,
  })
  router.get('/settings', (_request, response) => response.json(settings()))
  router.post('/settings', (request, response) => {
    const input = z.object({ variant: variantSchema }).strict().safeParse(request.body)
    if (!input.success)
      throw new HttpError(400, 'Choose a supported agent design.')
    store.setActiveVariant(input.data.variant)
    response.json(settings())
  })
  router.get('/evaluations', (_request, response) => {
    const summaries = (store.runs() as Array<Record<string, unknown>>).map((run) => {
      const input = run.input as { variant: string, messages: string[], caseId?: string, caseTitle?: string, category?: string, batchId?: string }
      return {
        id: run.id,
        createdAt: run.createdAt,
        variant: input.variant,
        title: input.caseTitle || input.messages[0],
        caseId: input.caseId,
        category: input.category,
        batchId: input.batchId,
        turnCount: input.messages.length,
        status: run.status,
        mode: run.mode,
        durationMs: run.durationMs,
        modelGrade: run.modelGrade,
        codeChecks: run.codeChecks,
        models: run.models,
        grading: run.grading
          ? { version: (run.grading as { version: string }).version }
          : undefined,
        sourceRunId: run.sourceRunId,
        codeStatus: run.codeStatus,
      }
    })
    response.json(summaries)
  })
  router.get('/evaluations/:id', (request, response) => {
    const id = z.uuid().safeParse(request.params.id)
    if (!id.success)
      throw new HttpError(404, 'Evaluation not found.')
    const run = store.evaluation(id.data)
    if (!run)
      throw new HttpError(404, 'Evaluation not found.')
    response.json(run)
  })
  router.post('/evaluations/:id/regrade', async (request, response) => {
    const input = z.object({
      batchId: z.string().min(1).max(100),
    }).strict().safeParse(request.body)
    const id = z.uuid().safeParse(request.params.id)
    if (!input.success || !id.success)
      throw new HttpError(400, 'Provide a saved evaluation ID and a new batch ID.')
    response.json(await regradeSavedRun({
      store,
      provider,
      id: id.data,
      batchId: input.data.batchId,
    }))
  })
  return router
}
