export const serializeDynamicAgents = (
  pathToPikkuTypes: string,
  _auth: boolean
) => {
  return `import { wireAddon } from '${pathToPikkuTypes}'

wireAddon({ name: 'dynamic-agents', package: '@pikku/addon-dynamic-agents' })
`
}
