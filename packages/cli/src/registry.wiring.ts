import { wireRemoteAddon } from '../.pikku/addon/index.js'
import { registryCredential, registryUrl } from './utils/remote-addon-sync.js'

// The CLI calls the addon registry through the registry's own SDK, committed
// under .pikku/remote with its pikku-addons.lock entry, so the CLI builds and
// syncs offline. knowledge: the-cli-commits-its-registry-sdk
//
// Its own file because build.sh's bootstrap stage runs a published CLI that
// predates versioned packages and has to be told to skip it.
wireRemoteAddon({
  name: 'registry',
  package: '@pikkustudio/addon-registry@^1.0.0',
  serverUrl: ({ config }) => registryUrl(config),
  // The registry host serves the addon under its own `registry` namespace.
  remoteName: (fn) => `registry:${fn}`,
  // Null — no credential — for a plain-http registry or no login: public SDKs
  // still resolve.
  auth: { resolve: ({ config }) => registryCredential(registryUrl(config)) },
})
