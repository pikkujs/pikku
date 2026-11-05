import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCloudRPC } from './http.js'
import { CLOUD_CONTRACT_RPCS } from '../contract/cloud-api.meta.gen.js'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const BARE = ['requestCliAuth', 'pollCliAuth', 'submitFinding']
// Called by pikku-console, served under cloud:, newer than the published contract.
const PENDING_PUBLISH = [
  'ensureProjectAspirations',
  'getProjectAspirations',
  'reactToProjectAspiration',
]

/** Every name passed to `.invoke('name'` by the CLI's own source. */
function invokedNames(): string[] {
  const names = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (
        /\.ts$/.test(entry.name) &&
        !/\.(test|gen)\.ts$/.test(entry.name)
      ) {
        for (const m of readFileSync(path, 'utf8').matchAll(
          /\.invoke\(\s*'([A-Za-z]+)'/g
        ))
          names.add(m[1]!)
      }
    }
  }
  walk(join(import.meta.dir, '..'))
  // CloudAddonVerify is a function of this addon, run in-process, not a cloud call.
  names.delete('CloudAddonVerify')
  return [...names].sort()
}

async function urlFor(name: string): Promise<string> {
  let url = ''
  globalThis.fetch = (async (input: any) => {
    url = String(input?.url ?? input)
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const rpc = getCloudRPC({ apiUrl: 'https://api.example.test', token: 't' })
  await (rpc.invoke as any)(name, {})
  return new URL(url).pathname
}

describe('getCloudRPC rpc names', () => {
  test('the scan finds the calls the CLI makes', () => {
    const names = invokedNames()
    expect(names.length).toBeGreaterThan(40)
    expect(names).toContain('cloudCliProjects')
    expect(names).toContain('listStages')
    for (const name of BARE) expect(names).toContain(name)
    expect(names).toContain('createSandboxChange')
  })

  test.each(invokedNames())(
    '%s is served where the contract says',
    async (name) => {
      const path = await urlFor(name)
      if (BARE.includes(name)) expect(path).toBe(`/rpc/${name}`)
      else if (name === 'createSandboxChange')
        expect(path).toBe('/rpc/machine:createSandboxChange')
      else if (PENDING_PUBLISH.includes(name))
        expect(path).toBe(`/rpc/cloud:${name}`)
      else {
        expect(CLOUD_CONTRACT_RPCS.has(name)).toBe(true)
        expect(path).toBe(`/rpc/cloud:${name}`)
      }
    }
  )

  test('the bare calls are not in the contract', () => {
    for (const name of BARE) expect(CLOUD_CONTRACT_RPCS.has(name)).toBe(false)
  })

  test('the generated name list matches the generated rpc map', () => {
    const map = readFileSync(
      join(import.meta.dir, '../contract/cloud-api.gen.ts'),
      'utf8'
    )
    const keys = [
      ...map.matchAll(/^ {2}readonly '([^']+)': RPCHandler</gm),
    ].map((m) => m[1]!)
    expect([...CLOUD_CONTRACT_RPCS].sort()).toEqual(keys.sort())
  })

  test('an already prefixed name is left alone', async () => {
    expect(await urlFor('cloud:listStages')).toBe('/rpc/cloud:listStages')
  })

  test('a name in neither the contract nor the uncontracted list is refused, not sent to 404', async () => {
    await expect(urlFor('notAFunction')).rejects.toThrow(
      /not in the cloud API contract/
    )
  })

  test('without credentials the request carries no authorization header', async () => {
    let headers: Headers | undefined
    globalThis.fetch = (async (input: any, init: any) => {
      headers = new Headers(init?.headers ?? input?.headers)
      return new Response('{}', { status: 401 })
    }) as typeof fetch
    const rpc = getCloudRPC({ apiUrl: 'https://api.example.test', token: null })
    await expect(
      (rpc.invoke as any)('listStages', { projectId: 'p' })
    ).rejects.toBeDefined()
    expect(headers?.get('authorization')).toBeNull()
  })
})
