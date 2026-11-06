import type { ErrorRequestHandler } from 'express'
import type { ModelProvider } from './contracts.ts'
import type { Variant } from './models.ts'
import type { Store } from './store.ts'
import express from 'express'
import { z } from 'zod'
import { evaluate } from './evaluations.ts'
import { ConversationService, HttpError } from './service.ts'

export function createApp(store: Store, provider: ModelProvider, variant: Variant = 'single') {
  const app = express()
  const service = new ConversationService(store, provider)
  app.disable('x-powered-by')
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use((request, response, next) => {
    const origin = request.get('origin')
    if (origin && new URL(origin).host !== request.get('host')) {
      response.status(403).json({ error: 'Use the local app origin.' })
      return
    }
    next()
  })
  app.use(express.json({ limit: '100kb' }))
  app.get('/api/health', (_request, response) => response.json({ status: 'ok', mode: provider.mode }))
  app.get('/api/community', (_request, response) => response.json({
    facts: store.facts(),
  }))
  app.post('/api/conversations', (_request, response) => response.status(201).json(store.createConversation()))
  app.post('/api/conversations/:id/messages', async (request, response) => {
    if (request.query.variant !== undefined)
      throw new HttpError(400, 'This setting is controlled by the server.')
    response.json(await service.submit(String(request.params.id), request.body, variant))
  })
  app.get('/api/conversations', (_request, response) => response.json(store.conversations()))
  app.get('/api/conversations/:id', (request, response) => {
    if (!z.uuid().safeParse(request.params.id).success || !store.hasConversation(String(request.params.id)))
      throw new HttpError(404, 'Conversation not found.')
    response.json({
      turns: store.turns(String(request.params.id)),
      pending: store.pending(String(request.params.id)),
    })
  })
  app.get('/api/requests', (_request, response) => response.json(store.requests()))
  app.get('/api/evaluations', (_request, response) => response.json(store.runs()))
  app.post('/api/evaluations', async (request, response) => response.json(await evaluate(store, provider, request.body)))
  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error instanceof HttpError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 500
    response.status(status).json({
      error: status === 500
        ? 'The server could not complete the request.'
        : error.message,
    })
  }
  app.use('/api', handleError)
  return app
}
