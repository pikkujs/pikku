import type { HTTPMethod } from '@pikku/core/http'
import type { IFunctionWorld } from '../world.js'
import type { CucumberStepApi } from './common.js'

type TableLike = { rows: () => string[][] }

function parseRequestTable(table: TableLike): {
  headers: Record<string, string>
  body: Record<string, unknown>
} {
  const headers: Record<string, string> = {}
  const body: Record<string, unknown> = {}
  for (const row of table.rows()) {
    const kind = row[0]
    const key = row[1]
    const raw = row[2]
    if (!kind || !key || raw === undefined) continue
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      value = raw
    }
    if (kind === 'header') {
      headers[key] = String(value)
    } else if (kind === 'body') {
      body[key] = value
    }
  }
  return { headers, body }
}

export function registerHTTPSteps(cucumber: CucumberStepApi): void {
  // ── When: plain request ───────────────────────────────────────────────────
  cucumber.When(
    '{actor} makes a {string} request to {string}',
    async function (
      this: IFunctionWorld,
      personaName: string,
      method: string,
      path: string
    ) {
      await this.httpCall(personaName, {
        method: method.toLowerCase() as HTTPMethod,
        path,
      })
    }
  )

  // ── When: request with body/header table ─────────────────────────────────
  cucumber.When(
    '{actor} makes a {string} request to {string} with:',
    async function (
      this: IFunctionWorld,
      personaName: string,
      method: string,
      path: string,
      table: TableLike
    ) {
      const { headers, body } = parseRequestTable(table)
      await this.httpCall(personaName, {
        method: method.toLowerCase() as HTTPMethod,
        path,
        headers,
        body: Object.keys(body).length > 0 ? body : undefined,
      })
    }
  )
}
