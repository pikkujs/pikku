import { defineProvider } from '@pikku/core/provider'

// PKU371: the parameter is read as a whole object, so the build cannot tell what it needs.
export const whole = defineProvider((services: any) => ({
  stamp: services.logger,
}))
