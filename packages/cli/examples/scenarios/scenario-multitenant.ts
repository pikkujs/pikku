//~ name: scenario-multitenant
//~ title: Scenario — TENANT ISOLATION (org A's data is invisible to org B)
//~ entity: company
//~ when: PHASE 7.5/7.6, for any app with the organization() plugin or an org/tenant scope. This is the scenario that PROVES multi-tenancy actually works: one org's user creates data, a DIFFERENT org's user lists it and must see NOTHING. A missing `where organizationId = session.activeOrganizationId` leaks every tenant's rows to every other — green CRUD hides it, this catches it. Needs two actors in DIFFERENT orgs (see below). Pull `--name scenario` first, and see `@pikku/better-auth`'s organization() plugin for the org setup + sign-up bootstrap.
// ===== FILE: packages/functions/test/scenarios/tenant-isolation.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ TWO ACTORS, TWO ORGS. With the organization() plugin's sign-up bootstrap, every
//~ signed-up user gets their OWN org made active — so the owner and `outsider` are
//~ each alone in a separate org automatically (no id passed anywhere; the SESSION
//~ carries activeOrganizationId). Declare `outsider` as a second persona in
//~ definePersonas (its own id → its own derived email → distinct user → distinct
//~ org). 3rd arg is `{ scenario, actors }` (NOT `workflow`).
//~
//~ The assertion has TWO halves and you need BOTH:
//~  1. the OWNER sees their own row (scope isn't SO tight it hides your own data), and
//~  2. the OUTSIDER does NOT (scope isn't SO loose it leaks across tenants).
export const tenantIsolationScenario = pikkuScenario<void, { companyId: string }>({
  title: 'Tenant isolation (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    const outsider = actors?.outsider ?? actors?.member
    if (!actors?.visitor || !outsider) {
      throw new Error(
        'needs run actors (visitor + a second-org actor `outsider`/`member`) — run via `pikku scenario run <env>`',
      )
    }
    logger.debug('tenant isolation starting')
    //~ ORG A's user creates a row (identity/scope comes from their SESSION, not {data}).
    const created = await scenario.do(
      'org A creates a company',
      'createCompany',
      { name: 'Acme Inc' },
      { actor: actors.visitor },
    )
    //~ HALF 1 — the OWNER must see their own row.
    const own = await scenario.do(
      'org A sees its own company',
      'listCompanies',
      {},
      { actor: actors.visitor },
    )
    if (!own.companies.some((c) => c.id === created.company.id)) {
      throw new Error(
        'org A created a company but does NOT see it in its own list — the tenant scope is too tight (hides your own data)',
      )
    }
    //~ HALF 2 — a DIFFERENT org's user must NOT see it.
    const foreign = await scenario.do(
      "org B cannot see org A's company",
      'listCompanies',
      {},
      { actor: outsider },
    )
    if (foreign.companies.some((c) => c.id === created.company.id)) {
      throw new Error(
        "org B can see org A's company — tenant isolation is BROKEN: a query is missing `where organizationId = session.activeOrganizationId`",
      )
    }
    return { companyId: created.company.id }
  },
})
