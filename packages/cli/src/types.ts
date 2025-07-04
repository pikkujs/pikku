import { InspectorState } from '@pikku/inspector'
import { PikkuCLIConfig } from './pikku-cli-config.js'
import { CLILogger, PikkuCLIOptions } from './utils.js'

export type PikkuCommand = (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState,
  options?: PikkuCLIOptions
) => Promise<boolean>

export type PikkuCommandWithoutState = (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  options?: PikkuCLIOptions
) => Promise<boolean>
