import { StubTracker, createStubHelpers } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/internal'
import { loadUserModule } from './load-user-project.js'

interface FactoryMeta {
  file: string
  variable: string
}

interface TestFactoryMetas {
  testServicesFactory?: FactoryMeta
  testWireServicesFactory?: FactoryMeta
}

// Importing the test wire services module is enough to register its factory —
// the generated wrapper self-registers in pikkuState.
export const applyTestServices = async (
  logger: {
    info: (msg: string) => void
    error: (msg: string) => void
  },
  filesAndMethods: TestFactoryMetas,
  singletonServices: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const stubTracker = new StubTracker()
  let overrides: Record<string, unknown> = {}
  const { testServicesFactory, testWireServicesFactory } = filesAndMethods

  if (testServicesFactory) {
    const testModule = await loadUserModule(testServicesFactory.file)
    const factory = testModule[testServicesFactory.variable]
    overrides =
      (await factory(
        singletonServices,
        createStubHelpers(stubTracker, singletonServices)
      )) ?? {}
    logger.info(
      `Test services active — stubbed: ${Object.keys(overrides).join(', ') || '(none)'}`
    )
  }
  if (testWireServicesFactory) {
    await loadUserModule(testWireServicesFactory.file)
    logger.info(
      `Test wire services active (${testWireServicesFactory.variable})`
    )
  }
  pikkuState(null, 'package', 'testServicesEnabled', true)
  return { stubTracker, ...overrides }
}
