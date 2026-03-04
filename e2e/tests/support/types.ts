/**
 * Configuration for the e2e tests.
 */
export interface TestConfig {
  /** Console UI base URL */
  consoleUrl: string
  /** Backend API base URL */
  apiUrl: string
  /** Timeout for LLM responses (ms) */
  responseTimeout: number
}

export const config: TestConfig = {
  consoleUrl: process.env.CONSOLE_URL || 'http://localhost:7071',
  apiUrl: process.env.API_URL || 'http://localhost:4077',
  responseTimeout: 60_000,
}
