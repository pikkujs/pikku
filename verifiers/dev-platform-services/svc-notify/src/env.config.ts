import { z } from 'zod'
import { defineVariable } from '#pikku/addon/variables'

export const envSetting = z.string()

defineVariable({
  name: 'notifyChannel',
  displayName: 'Notify channel',
  description: 'The channel the notifier posts to.',
  variableId: 'NOTIFY_CHANNEL',
  schema: envSetting,
  optional: true,
})

defineVariable({
  name: 'pikkuUnit',
  displayName: 'Pikku unit',
  description: 'The deploy unit the unit tag names.',
  variableId: 'PIKKU_UNIT',
  schema: envSetting,
  optional: true,
})
