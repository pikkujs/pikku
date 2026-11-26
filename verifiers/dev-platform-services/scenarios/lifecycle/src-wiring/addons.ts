import { wireAddon } from '#pikku/addon'

// The hook chain, opted in by name. `hookStopOnly` stays out: it is a
// deploy-only service used by the Worker checks.
wireAddon({
  name: 'notify',
  package: '@verifier/svc-notify',
  services: ['hookC', 'hookB', 'hookA'],
})
