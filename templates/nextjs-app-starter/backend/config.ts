import { CreateConfig } from '@pikku/core'
import { LogLevel } from '@pikku/core/services'
import { Config } from './application-types.js'

export const getConfig: CreateConfig<Config> = async () => ({
  logLevel: LogLevel.debug,
})
