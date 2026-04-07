export const serializeDynamicWorkflows = (
  pathToPikkuTypes: string,
  _auth: boolean
) => {
  return `import { wireAddon } from '${pathToPikkuTypes}'

wireAddon({ name: 'dynamic-workflows', package: '@pikku/addon-dynamic-workflows' })
`
}
