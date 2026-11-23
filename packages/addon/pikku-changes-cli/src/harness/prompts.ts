/** The part of `pikku changes next`'s route the harness prompts read. */
export type HarnessRoute = {
  agent: string | null
  skill: string | null
  refs: string[]
  /** The route's context: one `## #<shortId> <title>` section per change. */
  context: string | null
}

export type HarnessItem = {
  /** Without the `#`. */
  shortId: string
  changeId: string
}

export type HarnessBuildContext = {
  route: HarnessRoute
  changeset: { id: string; title: string }
  /** The changeset's items, in the order they are to be built. */
  items: HarnessItem[]
  worktree: string
}

const bare = (shortId: string) => shortId.replace(/^#/, '')

/** The `## #<id> ...` section of the route's context, the change's own text. */
const sectionOf = (route: HarnessRoute, shortId: string) =>
  (route.context ?? '')
    .split(/^(?=#{1,2} )/m)
    .find((part) => part.startsWith(`## #${shortId} `))
    ?.trim() ?? `## #${shortId}`

export const harnessRouteIntro = (route: HarnessRoute) =>
  `You are the ${route.agent ?? 'changes'} agent for this project.${route.skill ? ` Follow the ${route.skill} skill` : ''}${route.refs.length ? `${route.skill ? ', and' : ''} read ${route.refs.join(', ')} before you start` : ''}${route.skill || route.refs.length ? '.' : ''}`

/**
 * The first message of a builder session: build the changeset, commit each item, stop. The agent
 * runs no checks of its own; they run after it stops and their findings come back as its next message.
 */
export const harnessBuildPrompt = ({
  route,
  changeset,
  items,
  worktree,
}: HarnessBuildContext): string => {
  const ids = items.map((item) => `#${bare(item.shortId)}`)
  return [
    harnessRouteIntro(route),
    '',
    '# Your changeset',
    '',
    `You are building the changeset “${changeset.title}” (${changeset.id}): ${ids.join(', ')}. This directory, ${worktree}, is its own worktree on its own branch: build it here and nowhere else. Other agents are building other changesets at the same time, each in its own worktree.`,
    '',
    'Commit each item on its own as you finish it. The subject names the item, and the message ends with its trailer:',
    '',
    ...items.map(
      (item) =>
        `- #${bare(item.shortId)}: subject contains \`#${bare(item.shortId)}\`, trailer \`Change-Id: ${item.changeId}\``
    ),
    '',
    'Leave nothing uncommitted. Do not claim, file or mark changes done, and do not run `pikku check`, `pikku changes done`, `pikku changes next` or `pikku changes merge`.',
    'When every item is built and committed, stop. The checks (codegen, the type-check, lint and the others) run after you stop; if they find anything, their findings come back to you as the next message here. Fix them, commit, and stop again.',
    '',
    ...items.map((item) => sectionOf(route, bare(item.shortId))),
  ].join('\n')
}

/** A session picked up again after its process ended early, with no findings to give it. */
export const CONTINUE_PROMPT =
  'Your last run ended before you stopped (the process was interrupted). Look at `git status` and `git log` to see where you were, carry on with the changeset, commit, and stop.'

/** The message of a resumed session: the findings of the checks. */
export const resumePrompt = (feedback: string) =>
  `${feedback.trim()}\n\nFix these, commit, and stop. The checks run again after you stop.`

/**
 * A new session for a changeset whose earlier session cannot be resumed: the change as first given,
 * the commits already on the branch, and the findings that sent it back.
 */
export const freshRestartPrompt = ({
  changePrompt,
  gitLog,
  feedback,
}: {
  changePrompt: string
  gitLog: string
  feedback?: string
}): string =>
  [
    changePrompt,
    '',
    '# Where you are',
    '',
    'You worked on this changeset before, but that conversation is gone. Your earlier work is in this worktree; these are the commits on its branch, newest first:',
    '',
    gitLog.trim() || '(no commits yet)',
    '',
    ...(feedback
      ? [
          '# What the checks found',
          '',
          feedback.trim(),
          '',
          'Fix these, build anything still missing, commit, and stop.',
        ]
      : [
          'Look at `git status`, build what is still missing, commit, and stop.',
        ]),
  ].join('\n')

/**
 * The message of a repair turn in the project checkout: finished changesets were merged into the
 * branch it is on and together they fail its check. The agent fixes and commits; the check runs after it stops.
 */
export const harnessRepairPrompt = (failure: string): string =>
  [
    'You are repairing this checkout of the project, on the branch the changesets merge into. Changesets other agents built were merged into it one at a time, and the check after the last merge fails with what is below, so no new changeset is started until it passes.',
    '',
    'Fix it here, in this checkout, with the smallest change that keeps what each merged changeset was for, and commit the fix on this branch. Leave nothing uncommitted.',
    'Do not claim, file or mark changes done, and do not run `pikku check`, `pikku changes next` or `pikku changes merge`. The check runs again after you stop; if it still fails, its findings come back to you.',
    '',
    '# What the check found',
    '',
    failure.trim(),
  ].join('\n')

/**
 * The message of a merge-conflict turn: the route `pikku changes next` printed for the conflict,
 * which names the branch, the files and where to work. The merge itself runs after the agent stops.
 */
export const harnessConflictPrompt = (route: HarnessRoute): string =>
  [
    harnessRouteIntro(route),
    '',
    (route.context ?? '').trim(),
    '',
    'Do not claim, file or mark changes done, and do not run `pikku check`, `pikku changes next` or `pikku changes merge`. When the conflict is resolved and committed on that branch, stop: the merge into the branch the changesets merge into is tried again after you stop, and its check runs after it.',
  ].join('\n')
