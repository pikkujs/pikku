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

const apiUrl = process.env.API_URL || 'http://localhost:4077'

export const config: TestConfig = {
  // The console is served same-origin by pikku serve at <apiUrl>/console.
  consoleUrl: process.env.CONSOLE_URL || `${apiUrl}/console`,
  apiUrl,
  responseTimeout: 60_000,
}
