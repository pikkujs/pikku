import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeLocalCLIBootstrap } from './serialize-local-cli-bootstrap.js'
import type { Config } from '../../../../types/application-types.js'

const config = {
  rootDir: '/project',
  outDir: '.pikku',
  bootstrapFile: '/project/.pikku/pikku-bootstrap.gen.ts',
  localServicesFile: '/project/.pikku/pikku-local-services.gen.ts',
  packageMappings: {},
} as unknown as Config

const emit = () =>
  serializeLocalCLIBootstrap(
    'todo',
    {},
    '/project/.pikku/cli/pikku-cli-bootstrap.gen.ts',
    config,
    { file: '/project/src/config.ts', variable: 'createConfig' },
    { file: '/project/src/services.ts', variable: 'createSingletonServices' }
  )

/**
 * The generated bootstrap is the outermost frame of every project's own CLI, so
 * whatever it does with an error is what that CLI's users see. It used to print
 * `error.message` and drop the stack even when one was asked for.
 */
describe('the generated local CLI bootstrap', () => {
  test('reports through the shared formatter rather than console.error', () => {
    const code = emit()
    assert.match(code, /formatCLIError\(error, \{ verbose: wantsStackTrace\(/)
    assert.doesNotMatch(code, /console\.error\('Fatal error:'/)
  })

  test('imports the formatter from the same place the runner lives', () => {
    assert.match(
      emit(),
      /import \{ executeCLI, CLIError, formatCLIError, wantsStackTrace \} from '@pikku\/core\/cli'/
    )
  })

  test('installs the handlers that catch what escapes the await', () => {
    const code = emit()
    assert.match(code, /process\.on\('uncaughtException', reportFatal\)/)
    assert.match(code, /process\.on\('unhandledRejection', reportFatal\)/)
  })

  test('does not print a CLIError the runner already printed', () => {
    assert.match(
      emit(),
      /if \(error instanceof CLIError\) process\.exit\(error\.exitCode\)/
    )
  })
})

/**
 * A command run from the generated CLI used to get whatever the app's factory
 * built with nothing injected, so it saw none of the database-backed services
 * `pikku serve` hands the same factory.
 */
describe('the services the generated local CLI boots', () => {
  test('imports the generated local services beside the bootstrap', () => {
    assert.match(
      emit(),
      /import \{ createLocalServices \} from '\.\.\/pikku-local-services\.gen\.js'/
    )
  })

  test("hands them to the app's factory as its existing services", () => {
    assert.match(
      emit(),
      /createSingletonServices: async \(config\) =>\s+createSingletonServices\(config, await createLocalServices\(config\)\)/
    )
  })
})
