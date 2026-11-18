import { pikkuAddonServices } from '#pikku/addon/setup'
import { AltchaService } from './services/altcha.service.js'

/**
 * The database is the application's, so it is forwarded and never constructed.
 * The two secrets are read here and held by `AltchaService`, because functions
 * cannot reach `secrets`.
 */
export const createSingletonServices = pikkuAddonServices(
  async (_config, { kysely, secrets }) => ({
    kysely,
    altcha: new AltchaService(
      (await secrets.getSecret('ALTCHA_HMAC_SECRET')).reveal(),
      (await secrets.getSecret('ALTCHA_HMAC_KEY_SECRET')).reveal()
    ),
  })
)
