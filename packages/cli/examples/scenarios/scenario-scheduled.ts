//~ name: scenario-scheduled
//~ title: Scenario — cover a CRON / async effect (runScheduledTask + expectEventually)
//~ when: PHASE 7.5/7.6, when the app has a scheduled task, a queue worker, or any effect that lands ASYNCHRONOUSLY (a nightly digest, a reminder, a post-enqueue write). A scenario can FIRE the cron immediately and POLL for its effect — so these functions get covered without waiting for the schedule. Pull `--name scenario` first. This one is WRITTEN to `packages/functions/test/scenarios/daily-digest.scenario.ts` and names two things (the activity it creates and the digest it polls for) — rename both to yours in the file, since `--entity` only carries one.
// ===== FILE: packages/functions/test/scenarios/daily-digest.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ scenario.runScheduledTask fires a cron/scheduled task IMMEDIATELY so it gets
//~ covered. scenario.expectEventually POLLS an RPC until the effect appears — use
//~ it for anything that lands asynchronously. Queue jobs run when their enqueue RPC
//~ is called in a step. Only a real scenario.sleep is genuinely exempt. 3rd arg is
//~ `{ scenario, actors }` (NOT `workflow`).
export const dailyDigestScenario = pikkuScenario<void, { ok: boolean }>({
  title: 'Daily digest runs (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.visitor) throw new Error('needs run actors — run via `pikku scenario run <env>`')
    logger.debug('digest starting')
    await scenario.do(
      'create some activity',
      'createDeal',
      { title: 'For the digest', stage: 'lead' },
      { actor: actors.visitor },
    )
    //~ Fire the scheduled task now instead of waiting for its cron time.
    await scenario.runScheduledTask('sendDailyDigest')
    //~ Poll until the digest it produced is visible (up to `within` ms).
    await scenario.expectEventually(
      'the digest was recorded',
      'listDigests',
      {},
      (out: { digests: unknown[] }) => out.digests.length > 0,
      { actor: actors.visitor, within: 10_000 },
    )
    return { ok: true }
  },
})
