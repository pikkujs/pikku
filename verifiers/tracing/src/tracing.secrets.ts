import { defineSecret } from '#pikku/secrets'
import { z } from 'zod'

export const meshSecretSchema = z.string()

defineSecret({
  name: 'mesh-secret',
  displayName: 'Mesh secret',
  description: 'Signs mesh calls',
  secretId: 'PIKKU_MESH_SECRET',
  schema: meshSecretSchema,
})
