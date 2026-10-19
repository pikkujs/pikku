export const inboxDev = { provides: ['inbox'], run() {} }
export const inboxDeploy = { provides: ['inbox'], needs: ['kysely'], run() {} }
