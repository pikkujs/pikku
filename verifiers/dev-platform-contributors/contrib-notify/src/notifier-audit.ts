import type { Contributor } from '@pikku/core/contributors'

/** Decorates what `notifier` provides and provides nothing itself. */
const audit = (label: string): Contributor => ({
  provides: [],
  needs: ['notifier'],
  run: (services) => {
    services.notifier.audited = label
  },
})

export const notifierAuditDev = audit('dev')
export const notifierAuditDeploy = audit('deploy')
