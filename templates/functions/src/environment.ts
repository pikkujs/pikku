import { z } from 'zod'
import { defineVariable } from '#pikku/variables'
import { addError } from '#pikku/error'

export const appUrlSchema = z.url()

defineVariable({
  name: 'appUrl',
  displayName: 'App URL',
  description: 'Where a signed-in user is sent after auth',
  variableId: 'APP_URL',
  schema: appUrlSchema,
})

export class TodoLockedError extends Error {}

addError(TodoLockedError, {
  status: 423,
  message: 'That todo is being edited by someone else',
})
