import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100'
export default defineConfig({
  testDir: './tests',
  testMatch: '**/browser.spec.ts',
  use: { baseURL, channel: 'chrome', headless: true },
  workers: 1,
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
          NODE_ENV: 'production',
          MODEL_MODE: 'fake',
          PORT: '3100',
          DATABASE_PATH: join(tmpdir(), `acme-browser-${process.pid}.sqlite`),
        },
      },
})
