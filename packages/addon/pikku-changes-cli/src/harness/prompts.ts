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
