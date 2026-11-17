import { wireContributors } from '@pikku/core/contributors'
import { defineContributors } from '@pikku/core/contributors'
import { inboxDev, inboxDeploy as deployInbox } from './contributors/inbox.js'

export const cacheDeploy = { provides: ['cache'], run() {} }
const hidden = { run() {} }
declare const dynamic: any

export const contributors = defineContributors({
  inbox: { dev: inboxDev, deploy: deployInbox },
  cache: { deploy: cacheDeploy },
  decorator: { dev: hidden },
  inline: { dev: { run() {} } },
  neither: {},
  stray: { prod: cacheDeploy },
})

defineContributors({ inbox: { dev: inboxDev } })
defineContributors(dynamic)

// A plain package, not an addon: opts in at build time under the package name.
wireContributors({ package: '@fixture/shop-addon', contributors: ['inbox'] })
// PKU363: the package registers no such contributor.
wireContributors({ package: '@fixture/bare-addon', contributors: ['ghost'] })
wireContributors({ package: '@fixture/shop-addon', contributors: dynamic })
