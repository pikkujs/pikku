export const serializeCodeAssistant = (
  pathToPikkuTypes: string,
  _auth: boolean
) => {
  return `import { wireAddon } from '${pathToPikkuTypes}'

wireAddon({ name: 'code-assistant', package: '@pikku/code-assistant' })
`
}
