export {
  resolveApiContext,
  readAuthFile,
  writeAuthFile,
  DEFAULT_API_URL,
} from './lib/config.js'
export type { ResolvedApiContext, LinkedProject } from './lib/config.js'
export type { FabricProjectRow } from './lib/project-link.js'
export { getFabricRPC } from './lib/http.js'
export { deriveConsoleUrl } from './lib/console-url.js'
export { normalizeRepoUrl, listRemotes, matchRemoteProjects } from './lib/project-link.js'
export { readConfigProjectId, writeConfigProjectId } from './lib/project-id.js'
export type { PikkuRPC as FabricRPC } from './sdk/pikku-rpc.gen.js'
export type * from './sdk/rpc-map.gen.d.js'
