/** The console's secret administration functions, and nothing else. */
const SECRET_BROKER_FUNCTIONS = new Set([
  'pikkuConsoleSetSecret',
  'pikkuConsoleGetSecret',
  'pikkuConsoleHasSecret',
])

/** Whether this function keeps the full `SecretService`. */
export const isSecretBrokerFunction = (functionId: string): boolean =>
  SECRET_BROKER_FUNCTIONS.has(functionId) ||
  SECRET_BROKER_FUNCTIONS.has(functionId.split(':').pop() ?? '')
