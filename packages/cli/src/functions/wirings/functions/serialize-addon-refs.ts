interface AddonContracts {
  addonHttp: Record<string, Record<string, any>>
  addonChannel: Record<string, Record<string, any>>
  addonCli: Record<string, Record<string, any>>
}

const refFunc = (pikkuFuncId: string): string =>
  `ref(${JSON.stringify(pikkuFuncId)})`

const isHttpRouteConfig = (value: any): boolean =>
  value &&
  typeof value === 'object' &&
  'method' in value &&
  'route' in value &&
  'func' in value

const isHttpRouteGroup = (value: any): boolean =>
  value &&
  typeof value === 'object' &&
  'routes' in value &&
  !('method' in value)

const serializeHttpRouteMap = (routes: Record<string, any>): string => {
  const entries = Object.entries(routes).map(([key, value]) => {
    if (isHttpRouteConfig(value)) {
      const parts: string[] = []
      for (const [field, fieldValue] of Object.entries(value)) {
        if (field === 'func') {
          parts.push(`func: ${refFunc((fieldValue as any).pikkuFuncId)}`)
          continue
        }
        if (fieldValue === null || fieldValue === undefined) continue
        parts.push(`${JSON.stringify(field)}: ${JSON.stringify(fieldValue)}`)
      }
      return `${JSON.stringify(key)}: { ${parts.join(', ')} }`
    }

    if (isHttpRouteGroup(value)) {
      const parts: string[] = []
      if (value.basePath) {
        parts.push(`basePath: ${JSON.stringify(value.basePath)}`)
      }
      if (Array.isArray(value.tags) && value.tags.length > 0) {
        parts.push(`tags: ${JSON.stringify(value.tags)}`)
      }
      if (value.auth !== undefined && value.auth !== null) {
        parts.push(`auth: ${JSON.stringify(value.auth)}`)
      }
      parts.push(`routes: ${serializeHttpRouteMap(value.routes)}`)
      return `${JSON.stringify(key)}: { ${parts.join(', ')} }`
    }

    return `${JSON.stringify(key)}: ${serializeHttpRouteMap(value)}`
  })
  return `{ ${entries.join(', ')} }`
}

const serializeHttpContract = (contract: any): string => {
  const parts: string[] = []
  if (contract.basePath) {
    parts.push(`basePath: ${JSON.stringify(contract.basePath)}`)
  }
  if (Array.isArray(contract.tags) && contract.tags.length > 0) {
    parts.push(`tags: ${JSON.stringify(contract.tags)}`)
  }
  if (contract.auth !== undefined && contract.auth !== null) {
    parts.push(`auth: ${JSON.stringify(contract.auth)}`)
  }
  parts.push(`routes: ${serializeHttpRouteMap(contract.routes ?? {})}`)
  return `{ ${parts.join(', ')} }`
}

const serializeChannelContract = (contract: Record<string, any>): string => {
  const entries = Object.entries(contract).map(
    ([action, value]) =>
      `${JSON.stringify(action)}: { func: ${refFunc(value.pikkuFuncId)} }`
  )
  return `{ ${entries.join(', ')} }`
}

const serializeCliContract = (contract: Record<string, any>): string => {
  const entries = Object.entries(contract).map(([command, value]) => {
    const parts: string[] = [`func: ${refFunc(value.pikkuFuncId)}`]
    if (Array.isArray(value.positionals) && value.positionals.length > 0) {
      parts.push(`positionals: ${JSON.stringify(value.positionals)}`)
    }
    parts.push(`options: ${JSON.stringify(value.options ?? {})}`)
    return `${JSON.stringify(command)}: { ${parts.join(', ')} }`
  })
  return `{ ${entries.join(', ')} }`
}

const serializeMap = (
  namespaces: Record<string, Record<string, any>>,
  serializeContract: (contract: any) => string
): string => {
  const entries: string[] = []
  for (const [namespace, contracts] of Object.entries(namespaces)) {
    for (const [contractName, contract] of Object.entries(contracts)) {
      const key = `${namespace}:${contractName}`
      entries.push(`  ${JSON.stringify(key)}: ${serializeContract(contract)},`)
    }
  }
  return entries.length > 0 ? `{\n${entries.join('\n')}\n}` : '{}'
}

/**
 * Emit the addon contract reference helpers (refHTTP / refChannel / refCLI)
 * mirroring `ref`. Each helper indexes a generated const map whose functions
 * are pre-bound to ref('namespace:fn') RPC proxies, so type-checking and
 * runtime wiring resolve from the same artifact. basePath can be overridden
 * per HTTP reference; otherwise the addon contract's own basePath is preserved.
 */
export const serializeAddonRefs = (state: AddonContracts): string => {
  const exported = state ?? {
    addonHttp: {},
    addonChannel: {},
    addonCli: {},
  }
  const httpMap = serializeMap(exported.addonHttp ?? {}, serializeHttpContract)
  const channelMap = serializeMap(
    exported.addonChannel ?? {},
    serializeChannelContract
  )
  const cliMap = serializeMap(exported.addonCli ?? {}, serializeCliContract)

  return `
/**
 * Addon contract references. Generated from each wired addon's published
 * contract metadata — no addon source is imported. Functions are proxied via
 * ref() (RPC) exactly like ref('namespace:fn').
 */
const __addonHttp = ${httpMap} as const
const __addonChannel = ${channelMap} as const
const __addonCli = ${cliMap} as const

export const refHTTP = <Name extends keyof typeof __addonHttp>(
  name: Name,
  options?: { basePath?: string }
): (typeof __addonHttp)[Name] => {
  const contract = __addonHttp[name] as any
  return (
    options?.basePath !== undefined
      ? { ...contract, basePath: options.basePath }
      : contract
  ) as (typeof __addonHttp)[Name]
}

export const refChannel = <Name extends keyof typeof __addonChannel>(
  name: Name
): (typeof __addonChannel)[Name] => __addonChannel[name]

export const refCLI = <Name extends keyof typeof __addonCli>(
  name: Name
): (typeof __addonCli)[Name] => __addonCli[name]
`
}
