import { wireRemoteAddon } from '#pikku/addon'

/*
 * Outside `src/`, so `pikku all` does not read it as a real install: it would
 * look for the contract package in devDependencies. The shop's tsconfig still
 * compiles it. Wrapped in a function so nothing runs when it is loaded.
 */
export const installHostedAddon = () =>
  // @snippet start wireRemoteAddon
  wireRemoteAddon({
    name: 'billing',
    package: '@acme/addon-billing',
    serverUrl: 'https://billing.example.com',
    auth: { secretId: 'BILLING_TOKEN' },
    expose: ['createInvoice'],
  })
// @snippet end wireRemoteAddon
