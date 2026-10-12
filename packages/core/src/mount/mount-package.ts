import { pikkuState } from '../pikku-state.js'
import { mountCLICommands } from '../wirings/cli/mount-cli-commands.js'
import type { CLIExtension } from '../wirings/cli/mount-cli-commands.js'
import { mountHTTPRoutes } from './mount-http-routes.js'
import type { HTTPMountedRoute } from './mount-http-routes.js'
import { mountMCP } from './mount-mcp.js'
import type { MCPMount } from './mount-mcp.js'
import type { MountHandle } from './types.js'

export type PackageMountReport = {
  cli?: string[]
  http?: string[]
  mcp?: string[]
}

export type PackageExtension = {
  name: string
  packageName: string
  wirings: {
    cli?: { program: string } & Omit<CLIExtension, 'packageName'>
    http?: HTTPMountedRoute[]
    mcp?: Omit<MCPMount, 'packageName'>
  }
}

export type MountedPackage = {
  name: string
  packageName: string
  added: PackageMountReport
  unmount: () => PackageMountReport
}

const mounted = new Map<string, MountedPackage>()

export const mountPackage = (extension: PackageExtension): MountedPackage => {
  const { name, packageName, wirings } = extension
  if (mounted.has(name)) {
    throw new Error(`Package extension "${name}" is already mounted`)
  }
  const handles: Array<[keyof PackageMountReport, MountHandle]> = []
  try {
    if (wirings.cli) {
      const { program, ...cli } = wirings.cli
      handles.push(['cli', mountCLICommands({ program, ...cli, packageName })])
    }
    if (wirings.http) {
      handles.push([
        'http',
        mountHTTPRoutes({ routes: wirings.http, packageName }),
      ])
    }
    if (wirings.mcp) {
      handles.push(['mcp', mountMCP({ ...wirings.mcp, packageName })])
    }
  } catch (error) {
    for (const [, handle] of handles.reverse()) handle.unmount()
    throw error
  }

  const added: PackageMountReport = {}
  for (const [kind, handle] of handles) added[kind] = handle.added
  let done = false
  const result: MountedPackage = {
    name,
    packageName,
    added,
    unmount: () => {
      if (done) return added
      done = true
      for (const [, handle] of [...handles].reverse()) handle.unmount()
      pikkuState(packageName, 'package', 'singletonServices', null)
      if (mounted.get(name) === result) mounted.delete(name)
      return added
    },
  }
  mounted.set(name, result)
  return result
}

export const unmountPackage = (name: string): PackageMountReport | undefined =>
  mounted.get(name)?.unmount()

export const getMountedPackages = (): MountedPackage[] => [...mounted.values()]
