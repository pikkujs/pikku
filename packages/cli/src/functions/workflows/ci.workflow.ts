import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { CiRun } from '../ci/schemas.js'

export const ciWorkflow = pikkuWorkflowFunc<CiRun, void>({
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
      await workflow.do(
        'DB codegen',
        'pikkuCiStep',
        {
          stages: ['dbCodegen'],
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
    await workflow.do(
      'Validate',
      'pikkuCiStep',
      {
        stages: ['validate'],
        run: data,
      },
      { retries: 0 }
    )
    await workflow.do(
      'Audit',
      'pikkuCiStep',
      { stages: ['audit'], run: data },
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
      if (data.hasConsole) {
        await workflow.do(
          'Console removal',
          'pikkuCiRemoveConsole',
          {
            run: data,
          },
          { retries: 0 }
        )
        await workflow.do(
          'All without console',
          'pikkuCiStep',
          {
            stages: ['all'],
            run: data,
          },
          { retries: 0 }
        )
        await workflow.do(
          'Console check',
          'pikkuCiCheckConsole',
          { run: data },
          { retries: 0 }
        )
      }
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
    } else {
      await workflow.do(
        'App build',
        'pikkuCiStep',
        {
          stages: ['appBuild'],
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
