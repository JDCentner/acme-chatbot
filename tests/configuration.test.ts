import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from '../server/app.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

test('public messages use the configured agent variant', async () => {
  const store = new Store(':memory:')
  const app = createApp(store, new FakeProvider(), 'specialists')
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const root = `http://127.0.0.1:${address.port}/api`
  try {
    const conversation = store.createConversation()
    const response = await fetch(`${root}/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can my dad bring his car?',
        requestId: randomUUID(),
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(JSON.parse(store.turns(conversation.id)[0].audit).variant, 'specialists')
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    store.close()
  }
})

test('a public request cannot override the configured agent variant', async () => {
  const store = new Store(':memory:')
  const server = createApp(store, new FakeProvider(), 'single').listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const conversation = store.createConversation()
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/conversations/${conversation.id}/messages?variant=baseline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can my dad bring his car?',
        requestId: randomUUID(),
      }),
    })
    assert.equal(response.status, 400)
    assert.equal(store.turns(conversation.id).length, 0)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    store.close()
  }
})
