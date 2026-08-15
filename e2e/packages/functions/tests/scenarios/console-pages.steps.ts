/**
 * Steps for console pages whose subject is a local artefact on disk.
 *
 * The security audit and the changes diff both read paths on the machine the
 * console is serving from: the audit reads `.pikku/audit.json`, and the changes
 * page is pointed at two `.pikku/` directories through query parameters. That
 * makes both of them local-only — they cannot be aimed at a deployed
 * environment — which is why the paths are resolved from this file's own
 * location rather than from a working directory that a remote run would not
 * share.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import {
  pollUntil,
  requireActor,
  requireScenarioEnv,
} from '@pikku/core/scenario'
import type {} from '@pikku/playwright'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const FIXTURES_ROOT = resolve(E2E_ROOT, 'tests/fixtures')

/**
 * Removes the audit artefact so the page starts from a known-clean slate.
 *
 * `pikku serve` reads `audit.json` fresh on every RPC, so deleting the file is
 * the whole reset — nothing needs restarting.
 */
export const resetsSecurityAudit = pikkuScenarioStep<void, { reset: true }>({
  name: 'resetsSecurityAudit',
  description: 'removes any previous security audit report',
  template: 'resets the security audit',
  default: async () => {
    rmSync(resolve(E2E_ROOT, '.pikku', 'audit.json'), { force: true })
    return { reset: true }
  },
})

/**
 * Asserts the artefact the console rendered its report from.
 *
 * The page assertions can only say a report is on screen; this says what is in
 * it. It reads the same `.pikku/audit.json` the RPC serves, so a run that wrote
 * a report the UI happens to render as an empty state still fails here.
 */
export const expectsAuditReport = pikkuScenarioStep<
  { tool?: string; couldNotRun?: boolean },
  { tool: string; totalIssues: number; note: string | null }
>({
  name: 'expectsAuditReport',
  description: 'asserts the contents of the audit report on disk',
  template: 'the report is from {tool}',
  default: async (_services, expected) => {
    const path = resolve(E2E_ROOT, '.pikku', 'audit.json')
    if (!existsSync(path)) {
      throw new Error(`the audit wrote no report to ${path}`)
    }
    const report = JSON.parse(readFileSync(path, 'utf-8'))

    if (report.schemaVersion !== 1) {
      throw new Error(`unexpected audit schema version ${report.schemaVersion}`)
    }
    if (expected.tool && report.tool !== expected.tool) {
      throw new Error(
        `expected the audit to run under ${expected.tool}, got ${report.tool}`
      )
    }
    // An audit that could not run has to say so. Reporting zero advisories with
    // no note would read as "you are clean" when nothing was ever checked.
    if (expected.couldNotRun === true && !report.note) {
      throw new Error(
        'the audit reported no advisories and no note — a run that did not happen is being presented as a clean bill of health'
      )
    }
    if (expected.couldNotRun === false && report.note) {
      throw new Error(`the audit did not run: ${report.note}`)
    }

    return {
      tool: report.tool,
      totalIssues: report.summary.totalIssues,
      note: report.note ?? null,
    }
  },
})

export const opensChangesPage = pikkuScenarioStep<
  { ours: string; base: string },
  { url: string }
>({
  name: 'opensChangesPage',
  description: 'opens the changes page comparing two fixture states',
  template: 'compares {ours} against {base}',
  browser: async (_services, { ours, base }, { browser }) => {
    const params = new URLSearchParams({
      base: resolve(FIXTURES_ROOT, base),
      ours: resolve(FIXTURES_ROOT, ours),
    })
    await browser.goto(`/console/changes?${params}`)
    await browser.page
      .locator('[role="tab"]')
      .first()
      .waitFor({ state: 'visible' })
    return { url: browser.page.url() }
  },
})

export const clicksTab = pikkuScenarioStep<
  { name: string },
  { clicked: string }
>({
  name: 'clicksTab',
  description: 'switches to a tab',
  template: 'switches to the {name} tab',
  browser: async (_services, { name }, { browser }) => {
    await browser.page
      .getByRole('tab', { name: new RegExp(name, 'i') })
      .first()
      .click()
    return { clicked: name }
  },
})

/**
 * Asserts the change counts a tab carries in its own label.
 *
 * The diff page summarises each category on its tab as `+n` added and `~n`
 * modified, so the counts are read off the tab rather than by counting rows in
 * a list that may be virtualised or collapsed.
 */
export const expectsTabCounts = pikkuScenarioStep<
  { tab: string; added?: number; modified?: number },
  { tab: string }
>({
  name: 'expectsTabCounts',
  description: 'expects a diff tab to report the given change counts',
  template: 'expects the {tab} tab counts',
  browser: async (_services, { tab, added, modified }, { browser }) => {
    const target = browser.page
      .getByRole('tab', { name: new RegExp(tab, 'i') })
      .first()
    await target.waitFor({ state: 'visible' })
    const label = (await target.textContent()) ?? ''
    for (const [marker, count] of [
      ['+', added],
      ['~', modified],
    ] as const) {
      if (count !== undefined && !label.includes(`${marker}${count}`)) {
        throw new Error(
          `Expected the ${tab} tab to report ${marker}${count}, got: ${label}`
        )
      }
    }
    return { tab }
  },
})

/**
 * Triggers a webhook at the app's own sink and waits for it to be delivered.
 *
 * The in-memory queue worker delivers asynchronously and only then records the
 * attempt, so the wait is what stops the console assertions racing the worker.
 * The sink URL is returned rather than kept in module state: it is what every
 * later step matches the rendered delivery on.
 */
export const triggersWebhookDelivery = pikkuScenarioStep<
  { timeoutMs?: number },
  { sinkUrl: string; status: string }
>({
  name: 'triggersWebhookDelivery',
  description: 'delivers a webhook to the app’s own sink',
  template: 'triggers a webhook delivery',
  default: async (_services, { timeoutMs }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const sinkUrl = `${requireScenarioEnv(scenarioStep).apiUrl}/api/webhook/sink`
    await actor.invoke('triggerWebhook' as never, { url: sinkUrl } as never)

    let status: string | undefined
    const delivered = await pollUntil(
      async () => {
        const deliveries = (await actor.invoke(
          'console:listWebhookDeliveries' as never,
          {} as never
        )) as { url: string; status: string }[]
        status = deliveries.find((delivery) => delivery.url === sinkUrl)?.status
        return status === 'delivered' ? status : undefined
      },
      { timeoutMs }
    )
    if (!delivered) {
      throw new Error(
        `The webhook to ${sinkUrl} was ${status ?? 'never recorded'}, not delivered`
      )
    }
    return { sinkUrl, status: delivered }
  },
})

export const opensWebhookDelivery = pikkuScenarioStep<
  { sinkUrl: string; status: string },
  { opened: true }
>({
  name: 'opensWebhookDelivery',
  description: 'opens a delivery’s attempt history',
  template: 'opens the delivery',
  browser: async (_services, { sinkUrl, status }, { browser }) => {
    const row = browser.page
      .locator('table tbody tr')
      .filter({ hasText: sinkUrl })
      .first()
    await row.waitFor({ state: 'visible' })
    const text = (await row.textContent()) ?? ''
    if (!text.includes(status)) {
      throw new Error(
        `Expected the delivery to be ${status}, the row says: ${text}`
      )
    }
    await row.click()
    await browser.page.getByRole('dialog').waitFor({ state: 'visible' })
    return { opened: true }
  },
})

export const expectsDeliveryAttempt = pikkuScenarioStep<
  { attempt: string; status: number },
  { attempt: string }
>({
  name: 'expectsDeliveryAttempt',
  description: 'expects an attempt with a given response status',
  template: 'expects attempt {attempt} to have answered {status}',
  browser: async (_services, { attempt, status }, { browser }) => {
    const drawer = browser.page.getByRole('dialog')
    for (const text of [attempt, String(status)]) {
      await drawer
        .getByText(text, { exact: false })
        .first()
        .waitFor({ state: 'visible' })
    }
    return { attempt }
  },
})
