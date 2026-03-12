import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const SetCredentialInput = z.object({
  name: z.string(),
  valueJson: z.string(),
  userId: z.string().optional(),
})

export const SetCredentialOutput = z.object({ success: z.boolean() })

export const setCredential = pikkuSessionlessFunc({
  description: 'Sets a credential value',
  expose: true,
  input: SetCredentialInput,
  output: SetCredentialOutput,
  func: async ({ credentialService }, { name, valueJson, userId }) => {
    await credentialService!.set(name, JSON.parse(valueJson), userId)
    return { success: true }
  },
})

export const GetCredentialInput = z.object({
  name: z.string(),
  userId: z.string().optional(),
})

export const GetCredentialOutput = z.object({
  valueJson: z.string().nullable(),
})

export const getCredential = pikkuSessionlessFunc({
  description: 'Gets a credential value',
  expose: true,
  input: GetCredentialInput,
  output: GetCredentialOutput,
  func: async ({ credentialService }, { name, userId }) => {
    const value = await credentialService!.get(name, userId)
    return { valueJson: value != null ? JSON.stringify(value) : null }
  },
})

export const DeleteCredentialInput = z.object({
  name: z.string(),
  userId: z.string().optional(),
})

export const DeleteCredentialOutput = z.object({ success: z.boolean() })

export const deleteCredential = pikkuSessionlessFunc({
  description: 'Deletes a credential',
  expose: true,
  input: DeleteCredentialInput,
  output: DeleteCredentialOutput,
  func: async ({ credentialService }, { name, userId }) => {
    await credentialService!.delete(name, userId)
    return { success: true }
  },
})

export const HasCredentialInput = z.object({
  name: z.string(),
  userId: z.string().optional(),
})

export const HasCredentialOutput = z.object({ exists: z.boolean() })

export const hasCredential = pikkuSessionlessFunc({
  description: 'Checks if a credential exists',
  expose: true,
  input: HasCredentialInput,
  output: HasCredentialOutput,
  func: async ({ credentialService }, { name, userId }) => {
    const exists = await credentialService!.has(name, userId)
    return { exists }
  },
})

export const GetAllCredentialsInput = z.object({
  userId: z.string(),
})

export const GetAllCredentialsOutput = z.object({
  credentialsJson: z.string(),
})

export const getAllCredentials = pikkuSessionlessFunc({
  description: 'Gets all credentials for a user',
  expose: true,
  input: GetAllCredentialsInput,
  output: GetAllCredentialsOutput,
  func: async ({ credentialService }, { userId }) => {
    const credentials = await credentialService!.getAll(userId)
    return { credentialsJson: JSON.stringify(credentials) }
  },
})

export const ResetCredentialsInput = z.object({})

export const ResetCredentialsOutput = z.object({ success: z.boolean() })

export const resetCredentials = pikkuSessionlessFunc({
  description: 'Resets the credential service (for test isolation)',
  expose: true,
  input: ResetCredentialsInput,
  output: ResetCredentialsOutput,
  func: async ({ credentialService }) => {
    const service = credentialService as any
    if (service.store) {
      service.store.clear()
    }
    return { success: true }
  },
})
