/**
 * Wires contracts published by the addon package across the package boundary
 * using refHTTP / refChannel / refCLI — the addon's source is never imported.
 * Each reference resolves the addon's published contract metadata (loaded via
 * wireAddon) and proxies every function through ref() at runtime, while the
 * inspector tags the resulting wirings with the originating packageName.
 */

import { wireHTTPRoutes } from '@pikku/core/http'
import { wireChannel } from '@pikku/core/channel'
import { wireCLI } from '@pikku/core/cli'
import { refHTTP, refChannel, refCLI } from '#pikku'

wireHTTPRoutes({
  basePath: '/api',
  routes: { ext: refHTTP('ext:helloRoutes') },
})

wireChannel({
  name: 'ext-events',
  route: '/ext',
  auth: false,
  onMessageWiring: { action: refChannel('ext:helloChannel') },
})

wireCLI({ program: 'addon-cli', commands: { ...refCLI('ext:helloCommands') } })
