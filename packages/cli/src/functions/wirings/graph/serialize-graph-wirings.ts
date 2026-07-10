/**
 * Wire @pikku/addon-graph so `pikkuWorkflowGraph` nodes can reference its native
 * transform functions (e.g. `graph:editFields`).
 */
export const serializeGraphWirings = (pathToPikkuTypes: string) => {
  return `/**
 * @pikku/addon-graph wiring
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { wireAddon } from '${pathToPikkuTypes}'

wireAddon({ name: 'graph', package: '@pikku/addon-graph' })
`
}
