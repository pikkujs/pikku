import { defineContributors } from '@pikku/core/contributors'
import { greptimeTelemetry } from './greptime-contributor.js'

export const contributors = defineContributors({
  greptime: { dev: greptimeTelemetry, deploy: greptimeTelemetry },
})
