import { wireAddon } from '#pikku/addon'

// The hook chain, opted in by name. `hook-stop-only` stays out: it is a
// deploy-only variant used by the Worker checks.
wireAddon({
  name: 'notify',
  package: '@verifier/contrib-notify',
  contributors: ['hook-c', 'hook-b', 'hook-a'],
})
