import type { PlatformServiceContributor } from '@pikku/deploy'

const LOG_SOURCE = new URL('./log-source.ts', import.meta.url).href

export const logSources: PlatformServiceContributor = {
  name: 'log-sources',
  needs: ['auditLog', 'logger'],
  provides: ['logSources'],
  imports: [`import { LogSource } from ${JSON.stringify(LOG_SOURCE)}`],
  emit: () => [
    `  services.logSources = { workspace: new LogSource(services.auditLog.options.label, runtime.logger) }`,
  ],
}
