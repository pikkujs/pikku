import { LogLevel } from '@pikku/core/services'
import { pikkuAddonConfig } from '#pikku/addon/setup'

/*
 * An addon package's config factory. It is compiled with the addon, not with the
 * shop: an application has no `#pikku/addon/setup`, only `pikkuConfig`.
 */
// @snippet start pikkuAddonConfig
export const createConfig = pikkuAddonConfig(async ({ variables }) => ({
  logLevel: variables.get('BILLING_DEBUG') ? LogLevel.debug : LogLevel.info,
}))
// @snippet end pikkuAddonConfig
