import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { processDiagnostics } from './services.js'
import { ErrorCode } from '@pikku/inspector'
import type { InspectorDiagnostic } from '@pikku/inspector'

function fakeLogger() {
  const warnings: string[] = []
  const criticals: Array<[string, string]> = []
  const log = {
    warn(message: any) {
      warnings.push(typeof message === 'string' ? message : message.message)
    },
    critical(code: any, message: string) {
      criticals.push([code, message])
    },
  }
  return { log: log as any, warnings, criticals }
}

function dynamicImportDiagnostic(): InspectorDiagnostic {
  return {
    code: ErrorCode.FUNCTION_DYNAMIC_IMPORT,
    message: "Function 'greedy' performs a runtime dynamic 'import(...)'",
    sourceFile: 'greedy',
    position: 0,
  }
}

describe('processDiagnostics — functionDynamicImport (PKU498)', () => {
  test('warns by default (no lint config)', () => {
    const { log, warnings, criticals } = fakeLogger()
    processDiagnostics([dynamicImportDiagnostic()], undefined, log)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /PKU498/)
    assert.equal(criticals.length, 0)
  })

  test('is silent when configured off', () => {
    const { log, warnings, criticals } = fakeLogger()
    processDiagnostics(
      [dynamicImportDiagnostic()],
      { functionDynamicImport: 'off' },
      log
    )
    assert.equal(warnings.length, 0)
    assert.equal(criticals.length, 0)
  })

  test('escalates to critical when configured error', () => {
    const { log, warnings, criticals } = fakeLogger()
    processDiagnostics(
      [dynamicImportDiagnostic()],
      { functionDynamicImport: 'error' },
      log
    )
    assert.equal(warnings.length, 0)
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0][0], ErrorCode.FUNCTION_DYNAMIC_IMPORT)
  })
})

const policyCases = [
  {
    name: 'enforceContentService (PKU412)',
    code: ErrorCode.DIRECT_CONTENT_ACCESS,
    key: 'enforceContentService' as const,
  },
  {
    name: 'enforceVariablesService (PKU413)',
    code: ErrorCode.DIRECT_ENV_ACCESS,
    key: 'enforceVariablesService' as const,
  },
]

for (const { name, code, key } of policyCases) {
  const diagnostic = (): InspectorDiagnostic => ({
    code,
    message: 'src/a.ts reaches around a service',
    sourceFile: '/project/src/a.ts',
    position: 0,
  })

  describe(`processDiagnostics — ${name}`, () => {
    test('is an error by default (no lint config)', () => {
      const { log, warnings, criticals } = fakeLogger()
      processDiagnostics([diagnostic()], undefined, log)
      assert.equal(criticals.length, 1)
      assert.equal(criticals[0][0], code)
      assert.equal(warnings.length, 0)
    })

    test('is an error when other lint keys are set but not this one', () => {
      const { log, criticals } = fakeLogger()
      processDiagnostics([diagnostic()], { functionDynamicImport: 'off' }, log)
      assert.equal(criticals.length, 1)
    })

    test("only warns when configured 'warn'", () => {
      const { log, warnings, criticals } = fakeLogger()
      processDiagnostics([diagnostic()], { [key]: 'warn' }, log)
      assert.equal(criticals.length, 0)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], new RegExp(code))
    })

    test("is silent when configured 'off'", () => {
      const { log, warnings, criticals } = fakeLogger()
      processDiagnostics([diagnostic()], { [key]: 'off' }, log)
      assert.equal(warnings.length, 0)
      assert.equal(criticals.length, 0)
    })

    test('the two policy keys are independent', () => {
      const other = policyCases.find((c) => c.key !== key)!
      const { log, criticals } = fakeLogger()
      processDiagnostics([diagnostic()], { [other.key]: 'off' }, log)
      assert.equal(criticals.length, 1)
    })
  })
}
