/**
 * Type-level verification that the typed maps still export the custom types
 * they used to declare themselves. Checked by `tsc --noEmit`, never executed.
 */

import type { FormatPostalAddressInput as FromRPCMap } from '../../../.pikku/rpc/pikku-rpc-wirings-map.gen.d.js'
import type { FormatPostalAddressInput as FromInternalRPCMap } from '../../../.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.js'
import type { FormatPostalAddressInput as FromHTTPMap } from '../../../.pikku/http/pikku-http-wirings-map.gen.d.js'
import type { FormatPostalAddressInput as FromChannelsMap } from '../../../.pikku/channel/pikku-channels-map.gen.d.js'
import type { FormatPostalAddressInput as FromQueueMap } from '../../../.pikku/queue/pikku-queue-workers-wirings-map.gen.d.js'
import type { FormatPostalAddressInput as Shared } from '../../../.pikku/pikku-custom-types.gen.d.js'
import type { PostalAddress } from './postal-address.types.js'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const assertTrue = <T extends true>() => {}

assertTrue<Equals<FromRPCMap, Shared>>()
assertTrue<Equals<FromInternalRPCMap, Shared>>()
assertTrue<Equals<FromHTTPMap, Shared>>()
assertTrue<Equals<FromChannelsMap, Shared>>()
assertTrue<Equals<FromQueueMap, Shared>>()
assertTrue<
  Equals<Shared, { address: PostalAddress; uppercase?: boolean | undefined }>
>()
