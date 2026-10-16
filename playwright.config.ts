import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  reporter: 'html',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry' },
  webServer: { command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
