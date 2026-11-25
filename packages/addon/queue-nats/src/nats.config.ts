import { z } from 'zod'
import { defineVariable } from '#pikku/addon/variables'
import { defineSecret } from '#pikku/addon/secrets'

export const natsSetting = z.string().min(1)

defineVariable({
  name: 'natsUrl',
  displayName: 'NATS servers',
  description: 'Comma-separated URLs of the NATS servers to connect to.',
  variableId: 'NATS_URL',
  schema: natsSetting,
})

defineVariable({
  name: 'natsUser',
  displayName: 'NATS user',
  description: 'The broker user for this stage.',
  variableId: 'NATS_USER',
  schema: natsSetting,
})

defineSecret({
  name: 'natsPassword',
  displayName: 'NATS password',
  description: 'The broker password for this stage.',
  secretId: 'NATS_PASSWORD',
  schema: natsSetting,
})

defineVariable({
  name: 'pikkuProject',
  displayName: 'Pikku project',
  description: 'Names the project in NATS subjects and consumers.',
  variableId: 'PIKKU_PROJECT',
  schema: natsSetting,
})

defineVariable({
  name: 'pikkuStage',
  displayName: 'Pikku stage',
  description: 'Names the stage in NATS subjects and consumers.',
  variableId: 'PIKKU_STAGE',
  schema: natsSetting,
})
