export interface TestStreamErrorEvent {
  type: 'error'
  message?: string
  errorText?: string
}

export const getTestStreamErrorMessage = (
  event: TestStreamErrorEvent
): string => {
  const message = event.message ?? event.errorText
  if (message?.toLowerCase().includes('cannot find the requested resource')) {
    return 'No function-test harness found. Run `pikku tests init`, then run tests again.'
  }
  return message ?? 'Failed to run tests'
}
