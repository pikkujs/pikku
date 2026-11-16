import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { CiRun } from '../ci/schemas.js'

export const ciWorkflow = pikkuWorkflowFunc<CiRun, void>({
  auth: false,
  func: async ({}, data, { workflow }) => {
    if (data.inWorktree) {
      await workflow.do(
        'Install',
        'pikkuCiStep',
        {
          stages: ['install'],
          run: data,
        },
        { retries: 0 }
      )
    }
    await workflow.do(
      'Bootstrap',
      'pikkuCiStep',
      {
        stages: ['bootstrap'],
        run: data,
      },
      { retries: 0 }
    )
    // db migrate regenerates the database types itself.
    if (data.hasDb) {
      await workflow.do(
        'DB migrate',
        'pikkuCiStep',
        {
          stages: ['dbMigrate'],
          run: data,
        },
        { retries: 0 }
      )
    }
    if (data.hasEmails) {
      await workflow.do(
        'Emails generate',
        'pikkuCiStep',
        {
          stages: ['emails'],
          run: data,
        },
        { retries: 0 }
      )
    }
    await workflow.do(
      'All',
      'pikkuCiStep',
      { stages: ['all'], run: data },
      { retries: 0 }
    )
    // validate type-checks the project, and the frontends' own generated files
    // (a router tree, compiled messages) only exist once they have built. A
    // clean checkout has none, so the first app build comes before it. With a
    // provider the deployed builds below run again.
    await workflow.do(
      'App build',
      'pikkuCiStep',
      { stages: ['appBuild'], run: data },
      { retries: 0 }
    )
    await workflow.do(
      'Validate and audit',
      'pikkuCiStep',
      { stages: ['validate', 'audit'], run: data },
      { retries: 0 }
    )
    if (data.runTests) {
      await workflow.do(
        'Test',
        'pikkuCiStep',
        { stages: ['test'], run: data },
        { retries: 0 }
      )
    }
    if (data.provider) {
      await workflow.do(
        'Served app build',
        'pikkuCiStep',
        {
          stages: ['appBuildServed'],
          run: data,
        },
        { retries: 0 }
      )
      await workflow.do(
        'App build and deploy plan',
        'pikkuCiStep',
        {
          stages: ['appBuildRest', 'plan'],
          run: data,
        },
        { retries: 0 }
      )
    }
    if (data.deploy) {
      await workflow.do(
        'Deploy check',
        'pikkuCiCheckDeploy',
        { run: data },
        { retries: 0 }
      )
      await workflow.do(
        'Deploy',
        'pikkuCiStep',
        {
          stages: ['apply'],
          run: data,
        },
        { retries: 0 }
      )
    }
  },
})
