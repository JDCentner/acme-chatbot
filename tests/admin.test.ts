import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp } from '../server/app.ts'
import { FakeProvider } from '../server/simulation.ts'
import { Store } from '../server/store.ts'

async function withAdmin(check: (context: { root: string, store: Store }) => Promise<void>) {
  const store = new Store(':memory:')
  const server = createApp(store, new FakeProvider()).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try {
    await check({ root: `http://127.0.0.1:${address.port}/api`, store })
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    store.close()
  }
}
function setDesign(root: string, variant: string) {
  return fetch(`${root}/admin/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant }),
  })
}

test('admin saves the active design', async () => {
  await withAdmin(async ({ root }) => {
    const response = await setDesign(root, 'specialists')
    assert.equal(response.status, 200)
    const settings = await (await fetch(`${root}/admin/settings`)).json()
    assert.equal(settings.variant, 'specialists')
  })
})

test('invalid admin design does not replace the saved setting', async () => {
  await withAdmin(async ({ root }) => {
    await setDesign(root, 'single')
    assert.equal((await setDesign(root, 'invalid')).status, 400)
    assert.equal((await (await fetch(`${root}/admin/settings`)).json()).variant, 'single')
  })
})

test('a design change affects new conversations and preserves existing ones', async () => {
  await withAdmin(async ({ root }) => {
    const create = async () => (await fetch(`${root}/conversations`, { method: 'POST' })).json()
    const existing = await create()
    await setDesign(root, 'baseline')
    const current = await create()
    const previousDetail = await (await fetch(`${root}/conversations/${existing.id}`)).json()
    const currentDetail = await (await fetch(`${root}/conversations/${current.id}`)).json()
    assert.equal(previousDetail.variant, 'single')
    assert.equal(currentDetail.variant, 'baseline')
  })
})

test('admin settings and conversation assignments survive restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acme-admin-'))
  const path = join(directory, 'store.sqlite')
  let store = new Store(path)
  try {
    store.setActiveVariant('specialists')
    const conversation = store.createConversation('single')
    store.close()
    store = new Store(path)
    assert.equal(store.activeVariant('baseline'), 'specialists')
    assert.equal(store.conversationVariant(conversation.id, 'baseline'), 'single')
  }
  finally {
    store.close()
    rmSync(directory, { recursive: true })
  }
})

test('evaluation list omits transcripts and detail retains them', async () => {
  await withAdmin(async ({ root, store }) => {
    const saved = store.saveRun({
      input: {
        variant: 'single',
        messages: ['A question'],
      },
      transcript: [
        { user: 'A question', assistant: 'A reply' },
      ],
      mode: 'fake',
      status: 'fixture_only',
    })
    const list = await (await fetch(`${root}/admin/evaluations`)).json()
    assert.equal(list[0].title, 'A question')
    assert.equal(list[0].transcript, undefined)
    const detail = await (await fetch(`${root}/admin/evaluations/${saved.id}`)).json()
    assert.equal(detail.transcript.length, 1)
  })
})

test('unknown evaluation IDs return a clear not-found response', async () => {
  await withAdmin(async ({ root }) => {
    assert.equal((await fetch(`${root}/admin/evaluations/not-an-id`)).status, 404)
  })
})
