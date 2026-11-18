import { pikkuAddonServices } from '#pikku/addon/setup'
import { AltchaService, DEFAULT_COST } from './services/altcha.service.js'

/**
 * The database is the application's, so it is forwarded and never constructed.
 * The two secrets and the optional `ALTCHA_COST` variable are read here and held by `AltchaService`, because functions
 * cannot reach `secrets`.
 */
export const createSingletonServices = pikkuAddonServices(
  async (_config, { kysely, secrets, variables }) => ({
    kysely,
    altcha: new AltchaService(
      (await secrets.getSecret('ALTCHA_HMAC_SECRET')).reveal(),
      (await secrets.getSecret('ALTCHA_HMAC_KEY_SECRET')).reveal(),
      Number(await variables.get('ALTCHA_COST')) || DEFAULT_COST
    ),
  })
)
