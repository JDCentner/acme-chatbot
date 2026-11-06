import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  react: true,
  test: false, // Server tests use node:test; browser tests use Playwright.
  ignores: ['pnpm-lock.yaml', 'data/**'],
})
