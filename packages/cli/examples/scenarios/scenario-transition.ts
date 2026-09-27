//~ name: scenario-transition
//~ title: Scenario — a status/stage MOVE (board, pipeline, workflow state) asserted end-to-end
//~ entity: deal
//~ when: PHASE 7.5/7.6, when the app has anything that CHANGES STATE — a kanban move, a deal stage, an order status, an approve/reject. "Can't move cards across the board" is exactly this: the move RPC must exist AND the read must show the NEW state. Pull `--name scenario` first.
// ===== FILE: packages/functions/test/scenarios/deal-pipeline.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ create → fire the transition → read back → assert the NEW state landed.
//~ 3rd arg is `{ scenario, actors }`. Name the transition RPC for your app
//~ (moveDeal / updateDealStage / setStatus / approve …).
//~
//~ ⚠️ THIS PATTERN REQUIRES A CREATE for the entity you transition. Your actor
//~ starts with an EMPTY world (seed rows belong to OTHER users — never reach for
//~ them), so you must create the deal/invoice/claim here before moving it. If the
//~ app has the transition but NO create the actor can call (e.g. `markInvoicePaid`
//~ but no `createInvoice`), the function is UNCOVERABLE and that missing create is
//~ a BUILD DEFECT — record it in one line for the build agent (name the missing
//~ create RPC) and move on. Do NOT fake the entity, sign in as the seed owner, or
//~ grep for another user's row to reach it.
export const dealPipelineScenario = pikkuScenario<void, { dealId: string }>({
  title: 'Deal pipeline move (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.visitor) throw new Error('needs run actors — run via `pikku scenario run <env>`')
    logger.debug('deal pipeline starting')
    const created = await scenario.do(
      'create a deal',
      'createDeal',
      { title: 'Acme renewal', stage: 'lead' },
      { actor: actors.visitor },
    )
    //~ The transition RPC (moveDeal / updateDealStage / setStatus — name it for your app).
    await scenario.do(
      'move it to negotiation',
      'moveDeal',
      { id: created.deal.id, stage: 'negotiation' },
      { actor: actors.visitor },
    )
    //~ ASSERT the move actually took — read it back and check the stage.
    const moved = await scenario.do(
      'the deal is now in negotiation',
      'getDeal',
      { id: created.deal.id },
      { actor: actors.visitor },
    )
    if (moved.deal.stage !== 'negotiation') {
      throw new Error(
        `moveDeal returned success but the deal is still in "${moved.deal.stage}" — the transition did not persist`,
      )
    }
    return { dealId: created.deal.id }
  },
})
