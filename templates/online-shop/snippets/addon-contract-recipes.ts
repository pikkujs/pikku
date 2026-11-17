import { refCLI, refChannel, refHTTP } from '#pikku/function'
import { wireHTTPRoutes } from '#pikku/http'
import { wireChannel } from '#pikku/channel/pikku-channel-types.gen.js'
import { wireCLI } from '#pikku/cli/pikku-cli-types.gen.js'
import { hasScopes } from '#pikku/scopes/pikku-scope-client.gen.js'

/*
 * Usage of the addon contract helpers, kept here as the snippet source their
 * TSDoc points at. The shop installs no addon that publishes HTTP routes, a
 * channel or CLI commands, so each recipe takes the contract name as a type
 * parameter bounded by the names the installed addons publish: it compiles
 * against whatever is installed, and a name no addon publishes does not. Each
 * recipe is a function so nothing runs when the module is loaded.
 */

type HTTPContract = Parameters<typeof refHTTP>[0]
type ChannelContract = Parameters<typeof refChannel>[0]
type CLIContract = Parameters<typeof refCLI>[0]

export const mountAddonRoutes = <Name extends HTTPContract>(name: Name) =>
  // @snippet start refHTTP
  // `name` is `<addon name>:<contract name>`; basePath moves the addon's routes.
  wireHTTPRoutes({
    routes: { addon: refHTTP(name, { basePath: '/addon' }) },
  })
// @snippet end refHTTP

export const mountAddonChannel = <Name extends ChannelContract>(name: Name) =>
  // @snippet start refChannel
  wireChannel({
    name: 'addon',
    route: '/addon',
    auth: true,
    onMessageWiring: { type: refChannel(name) },
  })
// @snippet end refChannel

export const mountAddonCommands = <Name extends CLIContract>(name: Name) =>
  // @snippet start refCLI
  wireCLI({
    program: 'shop',
    commands: {
      addon: {
        description: 'Commands from an installed addon',
        subcommands: refCLI(name),
      },
    },
  })
// @snippet end refCLI

export const showRefundButton = (scopes: readonly string[]) =>
  // @snippet start hasScopes
  hasScopes(['orders:refund'], scopes)
// @snippet end hasScopes
