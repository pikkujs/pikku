import { wireAddon } from '#pikku/addon'
import { wireHTTP } from '#pikku/http'
import { installed, roundtrip } from '../src/functions.js'

// The store is a real addon: wireAddon registers it (so it shows as installed
// even if no function of it is called) and opts in to its contributor, which
// provides the `telemetryStore` service.
wireAddon({
  name: 'greptime',
  package: '@pikku/addon-greptime',
  contributors: ['greptime'],
})

wireHTTP({ method: 'post', route: '/roundtrip', auth: false, func: roundtrip })
wireHTTP({ method: 'get', route: '/installed', auth: false, func: installed })
