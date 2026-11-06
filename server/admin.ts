import type { ModelProvider } from './contracts.ts'
import type { Variant } from './models.ts'
import type { Store } from './store.ts'
import { Router } from 'express'
import { z } from 'zod'
import { variantSchema } from './models.ts'
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
      const input = run.input as { variant: string, messages: string[] }
      return {
        id: run.id,
        createdAt: run.createdAt,
        variant: input.variant,
        title: input.messages[0],
        turnCount: input.messages.length,
        status: run.status,
        mode: run.mode,
        durationMs: run.durationMs,
        modelGrade: run.modelGrade,
        codeChecks: run.codeChecks,
        models: run.models,
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
  return router
}
