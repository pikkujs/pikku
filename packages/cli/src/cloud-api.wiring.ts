import { wireRemoteAddon } from '../.pikku/addon/index.js'
import { registryUrl } from './utils/remote-addon-sync.js'

// The cloud API contract the `pikku cloud` addon is written against. It is
// wired here so the addon's `pikku.uses.cloud` has an instance to map to
// (cli.wiring.ts: uses: { cloud: 'cloudApi' }), and so this build syncs the SDK
// into .pikku/remote, pinned by the committed pikku-addons.lock, like the
// registry's own. The addon types its calls from it and makes them over HTTP
// with the user's login, so nothing here is called at runtime.
// knowledge: the-cli-syncs-its-registry-sdk-like-any-consumer
//
// Its own file for the same reason as registry.wiring.ts: build.sh's bootstrap
// stage runs a published CLI that predates versioned packages.
wireRemoteAddon({
  name: 'cloudApi',
  package: '@pikkustudio/addon-cloud-api@^0.0.2',
  serverUrl: ({ config }) => registryUrl(config),
  // The cloud API host serves the contract under its `cloud` namespace.
  remoteName: (fn) => `cloud:${fn}`,
  // Public read: the SDK resolves without a credential.
  auth: { resolve: () => null },
})
