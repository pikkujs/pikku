import { z } from 'zod'
import { defineVariable } from '#pikku/addon/variables'

export const bindingSetting = z.unknown()

defineVariable({
  name: 'queueBinding',
  displayName: 'Queue binding',
  description: 'The Worker queue binding the edge queue publishes to.',
  variableId: 'QUEUE',
  schema: bindingSetting,
  optional: true,
})
