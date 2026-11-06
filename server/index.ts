import { resolve } from 'node:path'
import process from 'node:process'
import express from 'express'
import { createApp } from './app.ts'
import { createProvider } from './models.ts'
import { Store } from './store.ts'

async function start(): Promise<void> {
  const port = Number(process.env.PORT || 3000)
  const store = new Store(process.env.DATABASE_PATH || 'data/acme.sqlite')
  const provider = createProvider()
  const app = createApp(store, provider)
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(resolve('dist')))
  }
  else {
    const { createServer } = await import('vite')
    const vite = await createServer({
      server: { middlewareMode: true },
    })
    app.use(vite.middlewares)
  }
  const server = app.listen(port, '0.0.0.0', () => console.warn(`ACME demo: http://localhost:${port} (${provider.mode})`))
  function shutdown(): void {
    server.close(() => {
      store.close()
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
