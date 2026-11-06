import { expect, test } from '@playwright/test'

test.beforeAll(async ({ request }) => {
  const health = await (await request.get('/api/health')).json()
  expect(health.mode, 'Browser checks require a fixture server to prevent live model calls.').toBe('fake')
  await request.post('/api/admin/settings', {
    data: { variant: 'single' },
  })
  await request.post('/api/evaluations', {
    data: {
      variant: 'single',
      messages: ['Can my dad bring his car?'],
      expectations: 'Residents can have cars.',
      expectedRequests: [],
    },
  })
  const conversation = await (await request.post('/api/conversations')).json()
  for (const message of [
    'I want a callback',
    'James',
    'Smith',
    'james@example.com',
    '202-555-0123',
    'tomorrow at 2pm',
    'confirm',
  ]) {
    await request.post(`/api/conversations/${conversation.id}/messages`, {
      data: {
        message,
        requestId: crypto.randomUUID(),
      },
    })
  }
})

test('desktop chat supports keyboard use and error recovery', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Room to live. Support to thrive.' })).toBeVisible()
  await page.getByRole('button', { name: 'Ask a question' }).click()
  const input = page.getByRole('textbox', { name: 'Your message' })
  await expect(input).toBeFocused()
  await input.fill('Can my dad bring his car?')
  await input.press('Enter')
  await expect(page.getByText('Residents can bring cars. Resident parking is available.')).toBeVisible()
  await page.route('**/messages', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Please retry."}' }))
  await input.fill('I want a tour.')
  await input.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Please retry.')
  await page.unroute('**/messages')
  await page.getByRole('button', { name: 'Retry message' }).click()
  await expect(page.getByText('What day and time would work for your tour?')).toBeVisible()
  await page.screenshot({ path: '/tmp/acme-desktop.png', fullPage: true })
  await input.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('mobile chat fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Ask Sophie' }).click()
  const dialog = page.getByRole('dialog')
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '/tmp/acme-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Close chat' }).click()
})

test('public site has no experiment controls or review links', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/fixture mode|live model|demo results|agent design/i)).toHaveCount(0)
  await expect(page.locator('a[href*="15500"], a[href*="review"], a[href*="admin"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ask a question' }).click()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('log')).toBeVisible()
})

test('old review URL opens the separate admin workspace', async ({ page }) => {
  await page.goto('/review.html')
  await expect(page.getByRole('heading', { name: 'Choose how Sophie works.' })).toBeVisible()
  await expect(page).toHaveURL(/admin.html/)
})

test('admin design changes persist and apply only to new chats', async ({ page, request }) => {
  const existing = await (await request.post('/api/conversations')).json()
  await page.goto('/admin')
  await expect(page.getByRole('radio')).toHaveCount(4)
  await page.getByRole('radio', { name: 'Better prompt + server time' }).check()
  await page.getByRole('button', { name: 'Use this design' }).click()
  await expect(page.getByRole('status')).toContainText('Design saved.')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Better prompt + server time' })).toBeChecked()
  await page.getByRole('radio', { name: 'Original prompt' }).check()
  await page.getByRole('button', { name: 'Use this design' }).click()
  await expect(page.getByRole('status')).toContainText('Design saved.')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Original prompt' })).toBeChecked()
  const current = await (await request.post('/api/conversations')).json()
  expect((await (await request.get(`/api/conversations/${existing.id}`)).json()).variant).toBe('single')
  expect((await (await request.get(`/api/conversations/${current.id}`)).json()).variant).toBe('baseline')
  await page.screenshot({ path: '/tmp/acme-admin-settings.png', fullPage: true })
  await request.post('/api/admin/settings', {
    data: { variant: 'single' },
  })
})

test('admin evaluations show verdicts, code checks, and displayed replies', async ({ page }) => {
  await page.goto('/admin.html')
  await page.getByRole('button', { name: 'Evaluations', exact: true }).click()
  await page.locator('.record-list-item').first().click()
  await expect(page.getByRole('heading', { name: 'Scenario notes and demo checks' })).toBeVisible()
  await expect(page.getByText('Fixture runs check integration only. Model quality was not graded.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Demo code checks' })).toBeVisible()
  await page.getByText('Inspect checks and tool outcomes').first().click()
  await expect(page.getByRole('heading', { name: 'Input decision' })).toBeVisible()
  await page.screenshot({ path: '/tmp/acme-admin-evaluation.png', fullPage: true })
  await page.getByRole('searchbox').fill('no-such-record-12345')
  await expect(page.getByText('No records match this search.')).toBeVisible()
})

test('mobile admin shows readable saved request details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin.html')
  await page.getByRole('button', { name: 'Requests', exact: true }).click()
  await page.locator('.record-list-item').first().click()
  await expect(page.getByRole('heading', { name: 'James Smith' })).toBeVisible()
  await expect(page.getByText('james@example.com', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: '/tmp/acme-admin-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Back to records' }).click()
  await expect(page.locator('.record-list')).toBeVisible()
})
