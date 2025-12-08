/**
 * Find and process first match workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const findFirstMatchWorkflow = pikkuWorkflowFunc<
  { candidates: Array<{ id: string; score: number; available: boolean }> },
  { selectedId: string | null; selectionReason: string }
>({
  title: 'Find First Match',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Find first available candidate with high score
    const selected = data.candidates.find((c) => c.available && c.score >= 80)

    if (selected) {
      await workflow.do('Assign selected candidate', 'leadAssign', {
        leadId: selected.id,
        salesRepId: 'primary-rep',
      })

      await workflow.do('Notify selection', 'notifyEmail', {
        userId: selected.id,
        subject: 'You have been selected',
        body: 'Congratulations on being selected!',
      })

      return {
        selectedId: selected.id,
        selectionReason: `Score: ${selected.score}`,
      }
    }

    // Fallback: find any available candidate
    const fallback = data.candidates.find((c) => c.available)

    if (fallback) {
      await workflow.do('Assign fallback candidate', 'leadAssign', {
        leadId: fallback.id,
        salesRepId: 'secondary-rep',
      })

      return {
        selectedId: fallback.id,
        selectionReason: 'Fallback selection',
      }
    }

    await workflow.do('No candidates available', 'notifySlack', {
      channel: '#alerts',
      message: 'No suitable candidates found',
    })

    return {
      selectedId: null,
      selectionReason: 'No candidates available',
    }
  },
})
