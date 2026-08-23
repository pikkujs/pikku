import { defineVariable } from '#pikku/variables'
import { z } from 'zod'
import type { SingletonServices } from '#pikku/function'

// The CLI requires `schema` to be a named export, not an inline `z.string()`.
export const CorsOriginsSchema = z.string()
export const FrontendUrlSchema = z.string()

defineVariable({
  name: 'corsOrigins',
  displayName: 'Allowed Browser Origins',
  description:
    'Comma-separated list of origins allowed to call this API from a browser, e.g. "https://app.example.com". Also the allowlist the analytics ingest enforces server-side. Unset falls back to FRONTEND_URL plus localhost.',
  variableId: 'CORS_ORIGINS',
  schema: CorsOriginsSchema,
})

defineVariable({
  name: 'frontendUrl',
  displayName: 'Frontend URL',
  description:
    "This app's own web origin. Used as the single-entry CORS allowlist when CORS_ORIGINS is not set.",
  variableId: 'FRONTEND_URL',
  schema: FrontendUrlSchema,
})

/**
 * The browser origins allowed to call this API.
 *
 * Read through the `variables` service, **not** `process.env`. A deployed unit
 * is a Cloudflare Worker, where there is no `process.env` — reading it there
 * silently yields `undefined`, collapsing the allowlist to the two localhost
 * fallbacks and leaving production with no configured origin at all.
 *
 * This lives in `lib/` rather than beside the CORS middleware because a file
 * holding zod schemas may not also make wiring calls (PKU490): the CLI imports
 * schema files at runtime, and the wiring side-effects crash without a server.
 *
 * Shared with the analytics origin lock so the server-side check enforces
 * exactly the list CORS advertises; two lists would drift and disagree.
 */
export async function allowedOrigins(
  variables: SingletonServices['variables']
): Promise<string[]> {
  const configured = await variables.get('CORS_ORIGINS')
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  }
  const frontendUrl = await variables.get('FRONTEND_URL')
  return [frontendUrl, 'http://localhost:7104', 'http://127.0.0.1:7104'].filter(
    (origin): origin is string => Boolean(origin)
  )
}
