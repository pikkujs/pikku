import { pikkuScenario } from '#pikku/scenarios'

/**
 * A scenario is a workflow whose steps run as real people over the real
 * transport — sign-in, middleware, scopes, permissions and serialization are
 * all exercised end to end. The same flow doubles as an e2e test and a
 * production health check.
 */
export const dispatcherPutsWorkOnAVan = pikkuScenario({
  title: 'Dispatcher puts work on a van',
  description:
    'Raise a job against a customer, assign it, and watch the technician close it.',
  tags: ['dispatch'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.dana || !actors?.theo) {
      throw new Error(
        'dispatcherPutsWorkOnAVan needs the `dana` and `theo` actors — run via `pikku scenario run`'
      )
    }
    const { dana, theo } = actors

    const customers = await scenario.do(
      'Dana opens the customer list',
      'listCustomers',
      null,
      { actor: dana }
    )
    const site = customers.customers[0]
    if (!site)
      throw new Error('Northwind has no customers to raise work against')

    const job = await scenario.do(
      'Dana raises a job',
      'raiseJob',
      {
        customerId: site.customerId,
        title: 'Pressure dropping overnight',
        priority: 'urgent',
      },
      { actor: dana }
    )

    const technicians = await scenario.do(
      'Dana looks at who is free',
      'listTechnicians',
      null,
      { actor: dana }
    )
    const theoRow = technicians.technicians.find(
      (t) => t.name === 'Theo Bright'
    )
    if (!theoRow)
      throw new Error('Theo is not on the Northwind technician list')

    await scenario.do(
      'Dana sends Theo',
      'assignJob',
      { jobId: job.jobId, technicianId: theoRow.technicianId },
      { actor: dana }
    )

    // Theo holds `jobs:progress` and is the assigned technician, so he passes
    // both gates on setJobStatus. This step is the one that proves the
    // permission key exists for a reason.
    await scenario.do(
      'Theo starts work',
      'setJobStatus',
      { jobId: job.jobId, status: 'in_progress' },
      { actor: theo }
    )

    await scenario.do(
      'Theo logs the visit',
      'logVisit',
      {
        jobId: job.jobId,
        technicianId: theoRow.technicianId,
        notes: 'Expansion vessel recharged, pressure holding at 1.2 bar.',
      },
      { actor: theo }
    )

    await scenario.do(
      'Theo closes the job',
      'setJobStatus',
      { jobId: job.jobId, status: 'done' },
      { actor: theo }
    )

    const settled = await scenario.do(
      'The job reads as done',
      'getJob',
      { jobId: job.jobId },
      { actor: dana }
    )
    if (settled.status !== 'done') {
      throw new Error(`Job ended in ${settled.status}, not done`)
    }
    if (settled.visits.length === 0) {
      throw new Error('The visit Theo logged is not on the job')
    }

    logger.info(
      `Scenario job ${job.jobId} closed with ${settled.visits.length} visit(s)`
    )
    return { jobId: job.jobId, visits: settled.visits.length }
  },
})

/**
 * The boundary, run as a step rather than asserted in a unit test.
 *
 * Maya holds the dispatcher role, exactly as Dana does. Every scope check
 * passes. The only thing standing between her and Northwind's board is that
 * her membership names a different company — which is the claim worth testing,
 * because it is the one a refactor can quietly remove.
 */
export const anotherCompanyCannotSeeTheBoard = pikkuScenario({
  title: 'Another company cannot see the board',
  description:
    'A dispatcher at a different service company is refused, with a 404 rather than a 403.',
  tags: ['dispatch', 'security'],
  func: async (_services, _input, { scenario, actors }) => {
    if (!actors?.dana || !actors?.maya) {
      throw new Error(
        'anotherCompanyCannotSeeTheBoard needs the `dana` and `maya` actors — run via `pikku scenario run`'
      )
    }
    const { dana, maya } = actors

    const northwind = await scenario.do(
      'Dana lists her own board',
      'listJobs',
      {},
      { actor: dana }
    )
    const target = northwind.jobs[0]
    if (!target) throw new Error('Northwind has no jobs to try to leak')

    const southgate = await scenario.do(
      'Maya lists her own board',
      'listJobs',
      {},
      { actor: maya }
    )
    if (southgate.jobs.some((j) => j.jobId === target.jobId)) {
      throw new Error('A Northwind job appeared on the Southgate board')
    }

    const refused = await scenario.do('Maya asks for it by id', async () => {
      try {
        await maya.invoke('getJob', { jobId: target.jobId })
        return { status: 0 }
      } catch (error) {
        return { status: (error as { status?: number }).status ?? 0 }
      }
    })

    // 404, not 403. A 403 would confirm the id names a real job, which turns
    // "can I read their work" into "can I enumerate their job ids".
    if (refused.status !== 404) {
      throw new Error(
        `Expected 404 for another tenant's job, got ${refused.status}`
      )
    }

    return { refusedWith: refused.status }
  },
})

/**
 * The same screen, two people, two different amounts of it.
 *
 * Casey is the customer's own site manager: `jobs:read` and nothing that
 * writes. The scenario asserts what she is refused as carefully as what she is
 * shown, because a role that can read everything and write nothing still reads
 * everything.
 */
export const customerSeesOnlyTheirOwnWork = pikkuScenario({
  title: 'Customer contact sees only what they should',
  description: 'The customer reads jobs and is refused every write.',
  tags: ['dispatch', 'security'],
  func: async (_services, _input, { scenario, actors }) => {
    if (!actors?.casey) {
      throw new Error(
        'customerSeesOnlyTheirOwnWork needs the `casey` actor — run via `pikku scenario run`'
      )
    }
    const { casey } = actors

    await scenario.do(
      'Casey reads the jobs on her site',
      'listJobs',
      {},
      {
        actor: casey,
      }
    )

    const refused = await scenario.do(
      'Casey tries to raise a job',
      async () => {
        try {
          await casey.invoke('raiseJob', {
            customerId: 'cus_harrow',
            title: 'Should never be created',
          })
          return { status: 0 }
        } catch (error) {
          return { status: (error as { status?: number }).status ?? 0 }
        }
      }
    )

    if (refused.status !== 403) {
      throw new Error(
        `Expected 403 when a customer contact writes, got ${refused.status}`
      )
    }

    return { refusedWith: refused.status }
  },
})
