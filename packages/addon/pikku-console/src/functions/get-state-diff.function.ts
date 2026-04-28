import { pikkuSessionlessFunc } from '#pikku'
import type { StateDiff } from '../services/state-diff.service.js'

export const getStateDiff = pikkuSessionlessFunc<
  { basePath: string; oursPath?: string },
  StateDiff
>({
  title: 'Get State Diff',
  description:
    'Diff the current project state (ours) against a baseline `.pikku/` directory (typically a worktree at main). Returns added/removed/modified entries per category.',
  expose: true,
  func: async ({ stateDiffService }, { basePath, oursPath }) => {
    if (!stateDiffService) {
      throw new Error('stateDiffService is not configured (no project root)')
    }
    return await stateDiffService.diff({ basePath, oursPath })
  },
})
