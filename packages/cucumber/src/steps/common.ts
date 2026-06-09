import assert from 'node:assert/strict'
import type { IFunctionWorld } from '../world.js'

type TableLike = { rowsHash: () => Record<string, string> }

export interface CucumberStepApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Given: (
    pattern: string,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  When: (
    pattern: string,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Then: (
    pattern: string,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
}

function tableToInput(table: TableLike): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(table.rowsHash())) {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      value = raw
    }
    const parts = key.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]!
      node[k] ??= {}
      node = node[k] as Record<string, unknown>
    }
    node[parts[parts.length - 1]!] = value
  }
  return out
}

function result(world: IFunctionWorld): Record<string, unknown> {
  if (world.lastError) {
    throw new Error(
      `expected a result but the call threw: ${world.lastError.message}`
    )
  }
  return world.lastResult as Record<string, unknown>
}

/**
 * Register the built-in step library against the consumer's cucumber instance.
 * Call from hooks.ts:
 *
 *   import { Given, When, Then } from '@cucumber/cucumber'
 *   import { registerCommonSteps } from '@pikku/cucumber/steps'
 *   registerCommonSteps({ Given, When, Then })
 */
export function registerCommonSteps(cucumber: CucumberStepApi): void {
  cucumber.Given(
    '{string} has session:',
    function (this: IFunctionWorld, name: string, table: TableLike) {
      this.setSession(name, tableToInput(table))
    }
  )

  cucumber.When(
    '{string} calls {string}',
    async function (this: IFunctionWorld, persona: string, rpc: string) {
      await this.call(persona, rpc, null)
    }
  )

  cucumber.When(
    '{string} calls {string} with:',
    async function (
      this: IFunctionWorld,
      persona: string,
      rpc: string,
      table: TableLike
    ) {
      await this.call(persona, rpc, tableToInput(table))
    }
  )

  cucumber.Then('the call succeeds', function (this: IFunctionWorld) {
    assert.equal(
      this.lastError,
      undefined,
      `expected success but got error: ${this.lastError?.message}`
    )
  })

  cucumber.Then('the call fails', function (this: IFunctionWorld) {
    assert.ok(this.lastError, 'expected the call to fail, but it succeeded')
  })

  cucumber.Then(
    'the call fails with {string}',
    function (this: IFunctionWorld, expected: string) {
      assert.ok(this.lastError, 'expected the call to fail, but it succeeded')
      const actual = `${this.lastError.name}: ${this.lastError.message}`
      assert.ok(
        actual.includes(expected),
        `expected error to include "${expected}" but got "${actual}"`
      )
    }
  )

  cucumber.Then(
    'the result has {string}',
    function (this: IFunctionWorld, key: string) {
      const r = result(this)
      assert.ok(r != null && key in r, `result has no key "${key}"`)
    }
  )

  cucumber.Then(
    'the result {string} is {string}',
    function (this: IFunctionWorld, key: string, value: string) {
      const r = result(this)
      assert.equal(String(r?.[key]), value)
    }
  )

  cucumber.Then(
    'the result is a list of {int}',
    function (this: IFunctionWorld, count: number) {
      const r = this.lastResult
      assert.ok(Array.isArray(r), `expected an array but got ${typeof r}`)
      assert.equal(r.length, count)
    }
  )

  cucumber.Then(
    'an email {string} was sent',
    function (this: IFunctionWorld, method: string) {
      this.tracker.assert('email', method)
    }
  )

  cucumber.Then(
    '{string} where {string} is {string} has {string} equal to {string}',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string,
      col: string,
      expected: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.ok(
        rows.length,
        `no "${table}" row where ${whereCol} = "${whereVal}"`
      )
      assert.equal(String(rows[0]![col]), expected)
    }
  )

  cucumber.Then(
    'a {string} row where {string} is {string} exists',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.ok(
        rows.length,
        `expected a "${table}" row where ${whereCol} = "${whereVal}", found none`
      )
    }
  )

  cucumber.Then(
    'no {string} row where {string} is {string} exists',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.equal(
        rows.length,
        0,
        `expected no "${table}" row where ${whereCol} = "${whereVal}", found ${rows.length}`
      )
    }
  )
}
