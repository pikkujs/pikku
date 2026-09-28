import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * A provider's webhook endpoints, kept in a file so a `pikku webhooks` run in
 * another process sees what this one registered.
 */
export type FakeEndpoint = {
  id: string
  url: string
  label: string
  events: string[]
  secret: string
}

const file = () => {
  const path = process.env.FAKE_PROVIDER_FILE
  if (!path) throw new Error('FAKE_PROVIDER_FILE is not set')
  return path
}

export const readEndpoints = (): FakeEndpoint[] =>
  existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf-8')) : []

export const writeEndpoints = (endpoints: FakeEndpoint[]) =>
  writeFileSync(file(), JSON.stringify(endpoints, null, 2))
