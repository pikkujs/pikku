import { pikkuAddonServices } from '#pikku/addon/setup'
import { SystemOneService } from './typesafe.service.js'

/**
 * `TYPESAFE_API_KEY` is read as a literal here so the CLI collects it into
 * `declaredSecrets` and scopes this addon to that one secret. That scoping is
 * the point: the addon makes outbound requests, where an unrestricted secret
 * read would be an exfiltration primitive, so a consumer must never widen it
 * with `globalSecrets`.
 */
export const createSingletonServices = pikkuAddonServices(
  async (config, { secrets }) => {
    const apiKey = await secrets.getSecret<string>('TYPESAFE_API_KEY')
    return {
      systemOne: new SystemOneService(apiKey.reveal(), config.model),
    }
  }
)
