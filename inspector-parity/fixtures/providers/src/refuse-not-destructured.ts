import { defineProvider } from '@pikku/core/provider'

// PKU371: the services parameter is not destructured.
export const whole = defineProvider((services: any) => ({ x: services.logger }))
