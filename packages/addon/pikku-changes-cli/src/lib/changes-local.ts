import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import type {
  AskChangeQuestionInput,
  AskChangeQuestionOutput,
  AttachChangeShotInput,
  AttachChangeShotOutput,
  ClaimChangesInput,
  ClaimChangesOutput,
  CompleteChangeInput,
  CompleteChangeOutput,
  CreateChangeInput,
  CreateChangeOutput,
  GetChangeInput,
  GetChangeOutput,
  ListChangesInput,
  ListChangesOutput,
  ReplyToChangeInput,
  ReplyToChangeOutput,
  ChangesRPC,
} from './types.js'
import { assertDependencies } from './change-order.js'
import { pickableStatus, type BoardStatus } from './changes-board.js'
import {
  inferSpecialist,
  isSpecialist,
  type Specialist,
} from './specialists.js'

export const LOCAL_PROJECT_ID = 'local'
const LOCAL_STAGE_ID = 'local'
const STORE_FILE = 'pikku-changes.json'

export type Routing = {
  specialist?: Specialist
  dependsOn?: string[]
}

type Filing = { backlog?: boolean }

export const ASK_KINDS = ['question', 'visual'] as const
export type AskKind = (typeof ASK_KINDS)[number]
export type Ask = { kind: AskKind; askedBy: string; askedAt: Date }

type Change = Omit<ListChangesOutput['changes'][number], 'status'> &
  Routing & { status: BoardStatus; ask?: Ask }

export type Move = 'backlog' | 'ready' | 'in_progress'

export type Declaration = {
  creates: string[]
  alters: string[]
  reads: string[]
  needsPlan: boolean
}

type Group = ListChangesOutput['groups'][number] & Partial<Declaration>
type Message = GetChangeOutput['thread'][number]

export type Store = {
  nextShortId: number
  changes: Change[]
  groups: Group[]
  messages: Message[]
}

type LocalMap = {
  listChanges: [ListChangesInput, ListChangesOutput]
  getChange: [GetChangeInput, GetChangeOutput]
  createChange: [CreateChangeInput & Routing & Filing, CreateChangeOutput]
  updateChange: [{ changeId: string } & Routing, { change: Change }]
  moveChange: [{ changeId: string; to: Move }, { change: Change }]
  claimChanges: [ClaimChangesInput, ClaimChangesOutput]
  completeChange: [CompleteChangeInput, CompleteChangeOutput]
  askChangeQuestion: [AskChangeQuestionInput, AskChangeQuestionOutput]
  replyToChange: [
    ReplyToChangeInput & { person?: boolean },
    ReplyToChangeOutput,
  ]
  attachChangeShot: [AttachChangeShotInput, AttachChangeShotOutput]
}

export type { ChangesRPC }

const DATES = new Set([
  'createdAt',
  'claimExpiresAt',
  'resolvedAt',
  'acknowledgedAt',
  'heldUntil',
  'askedAt',
])

class LocalChangesError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/**
 * The queue lives in git's common dir so every worktree of the checkout shares
 * one queue and parallel changesets never conflict over a committed file. Git
 * history is the durable record; this file may be trimmed at any time.
 */
export async function localStorePath(cwd = process.cwd()): Promise<string> {
  const host = process.env.PIKKU_CHANGES_DIR?.trim()
  if (host) return join(host, STORE_FILE)
  const dir = await git(['rev-parse', '--git-common-dir'], cwd)
  return join(isAbsolute(dir) ? dir : join(cwd, dir), STORE_FILE)
}

/**
 * Older stores kept `open` and `claimed` as statuses and `backlog` as a flag.
 * The status is now the board column and a claim lives on the group alone.
 */
export function migrate(store: Store): Store {
  for (const change of store.changes) {
    const old = change as { status: string; backlog?: boolean; ask?: Ask }
    if (old.status === 'open' || old.status === 'claimed') old.status = 'ready'
    if (old.backlog === true) old.status = 'backlog'
    delete old.backlog
    if (old.status === 'needs_answer' && !old.ask)
      old.ask = { kind: 'question', askedBy: 'agent', askedAt: new Date() }
  }
  return store
}

async function read(path: string): Promise<Store> {
  try {
    return migrate(
      JSON.parse(await readFile(path, 'utf8'), (key, value) =>
        DATES.has(key) && typeof value === 'string' ? new Date(value) : value
      )
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { nextShortId: 1, changes: [], groups: [], messages: [] }
  }
}

async function withStore<T>(path: string, fn: (store: Store) => T): Promise<T> {
  const lock = `${path}.lock`
  await mkdir(dirname(path), { recursive: true })
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const held = await stat(lock).catch(() => null)
      if (held && Date.now() - held.mtimeMs > 30_000) {
        await rmdir(lock).catch(() => {})
        continue
      }
      if (attempt > 200)
        throw new CloudPreconditionError(
          `${lock} is held; remove it if no pikku command is running.`
        )
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  try {
    const store = await read(path)
    const result = fn(store)
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(store, null, 2))
    await rename(tmp, path)
    return result
  } finally {
    await rmdir(lock)
  }
}

function find(store: Store, ref: string): Change {
  const short = ref.trim().match(/^#?(\d+)$/)?.[1]
  const change = store.changes.find((c) =>
    short ? c.shortId === short : c.changeId === ref.trim()
  )
  if (!change) throw new LocalChangesError(`No change ${ref}`, 404)
  return change
}

function tag(
  specialist: unknown,
  title: string,
  body?: string | null
): Specialist {
  if (specialist === undefined || specialist === null)
    return inferSpecialist(title, body)
  if (!isSpecialist(specialist))
    throw new LocalChangesError(
      `${String(specialist)} is not a specialist`,
      400
    )
  return specialist
}

function dependencies(
  store: Store,
  changeId: string,
  refs: string[] | undefined
): string[] {
  const ids = (refs ?? []).map((ref) => find(store, ref).changeId)
  try {
    assertDependencies(store.changes, changeId, ids)
  } catch (error) {
    throw new LocalChangesError((error as Error).message, 400)
  }
  return ids
}

function leaseLive(store: Store, change: Change, now: Date): boolean {
  if (!change.groupId) return false
  const group = store.groups.find((g) => g.groupId === change.groupId)
  return !!group?.claimExpiresAt && group.claimExpiresAt > now
}

/**
 * Schema changesets go one at a time, and a changeset cannot read a table that
 * a changeset still in flight is creating.
 */
function conflicts(store: Store, group: Group, now: Date): string | null {
  const schema = (g: Group) => !!(g.creates?.length || g.alters?.length)
  for (const other of store.groups) {
    if (other.groupId === group.groupId) continue
    if (!other.claimExpiresAt || other.claimExpiresAt <= now) continue
    if (schema(group) && schema(other))
      return `“${other.title}” is changing the schema; one schema changeset runs at a time. Claim a changeset that touches no tables, or wait.`
    const waiting = (group.reads ?? []).filter((t) =>
      other.creates?.includes(t)
    )
    if (waiting.length)
      return `“${other.title}” is creating ${waiting.join(', ')}; a changeset that reads it waits until that one is merged.`
  }
  return null
}

function message(
  store: Store,
  change: Change,
  authorKind: Message['authorKind'],
  authorName: string,
  body: string,
  attachments: Message['attachments'] = []
): Message {
  const entry: Message = {
    messageId: randomUUID(),
    changeId: change.changeId,
    authorKind,
    authorName,
    body,
    attachments,
    chosenOption: null,
    createdAt: new Date(),
  }
  store.messages.push(entry)
  return entry
}

function park(change: Change, kind: AskKind, askedBy: string): void {
  change.status = 'needs_answer'
  change.ask = { kind, askedBy, askedAt: new Date() }
}

const handlers: {
  [N in keyof LocalMap]: (store: Store, data: LocalMap[N][0]) => unknown
} = {
  listChanges: (store, input) => {
    const changes = store.changes.filter(
      (c) =>
        (!input.status || (input.status as string[]).includes(c.status)) &&
        (!input.groupId || c.groupId === input.groupId) &&
        (input.includeDone || (c.status !== 'done' && c.status !== 'dismissed'))
    )
    const shown = changes.slice(0, input.limit ?? changes.length)
    const groupIds = new Set(shown.map((c) => c.groupId))
    return {
      changes: shown,
      groups: store.groups.filter((g) => groupIds.has(g.groupId)),
    }
  },

  getChange: (store, input) => {
    const change = find(store, input.changeId)
    return {
      change: { ...change, live: null },
      thread: store.messages
        .filter((m) => m.changeId === change.changeId)
        .map((m) => ({
          ...m,
          attachments: m.attachments.map((a) => ({ ...a, url: null })),
        })),
      stageUrl: null,
    }
  },

  createChange: (store, input) => {
    const changeId = randomUUID()
    const dependsOn = dependencies(store, changeId, input.dependsOn)
    const change: Change = {
      changeId,
      specialist: tag(input.specialist, input.title, input.body),
      dependsOn,
      shortId: String(store.nextShortId++),
      projectId: LOCAL_PROJECT_ID,
      stageId: LOCAL_STAGE_ID,
      groupId: null,
      title: input.title,
      body: input.body ?? null,
      status: input.backlog === true ? 'backlog' : 'ready',
      source: 'console',
      requestedBranch: input.requestedBranch ?? null,
      route: input.route ?? null,
      gitSha: input.gitSha ?? null,
      deploymentId: null,
      locale: input.locale ?? null,
      viewport: input.viewport ?? null,
      capture: input.capture ?? null,
      screenshotKey: input.screenshotKey ?? null,
      branch: null,
      headCommit: null,
      resolvedAt: null,
      acknowledgedAt: null,
      resolvedBySandboxId: null,
      resolvedBySandboxSlug: null,
      createdAt: new Date(),
      held: false,
      heldUntil: null,
      screenshotUrl: null,
    }
    store.changes.push(change)
    return { change }
  },

  updateChange: (store, input) => {
    const change = find(store, input.changeId)
    if (input.specialist !== undefined)
      change.specialist = tag(input.specialist, change.title, change.body)
    if (input.dependsOn !== undefined)
      change.dependsOn = dependencies(store, change.changeId, input.dependsOn)
    return { change }
  },

  moveChange: (store, input) => {
    const change = find(store, input.changeId)
    const ref = `#${change.shortId}`
    if (change.status === 'done' || change.status === 'dismissed')
      throw new LocalChangesError(`${ref} is ${change.status}`, 409)
    if (input.to === 'in_progress') {
      if (change.status === 'backlog')
        throw new LocalChangesError(
          `${ref} is in the backlog; run \`pikku changes ready ${change.shortId}\` first`,
          409
        )
    } else if (input.to === 'ready') {
      if (change.status !== 'backlog' && change.status !== 'ready')
        throw new LocalChangesError(
          `${ref} is ${change.status}; only a backlog change can be made ready`,
          409
        )
    }
    change.status = input.to
    delete change.ask
    return { change }
  },

  claimChanges: (store, input: ClaimChangesInput & Partial<Declaration>) => {
    const now = new Date()
    const wanted = input.changeIds?.length
      ? input.changeIds.map((ref) => find(store, ref))
      : store.changes.filter(
          (c) =>
            pickableStatus(c.status) &&
            (c.groupId === input.groupId || !leaseLive(store, c, now))
        )
    const shelved = wanted.filter((c) => c.status === 'backlog')
    if (shelved.length)
      throw new LocalChangesError(
        shelved
          .map(
            (c) =>
              `#${c.shortId} is in the backlog; run \`pikku changes ready ${c.shortId}\` first`
          )
          .join('\n'),
        409
      )
    const taken = wanted.filter(
      (c) =>
        !pickableStatus(c.status) ||
        (leaseLive(store, c, now) && c.groupId !== input.groupId)
    )
    if (!wanted.length || taken.length)
      throw new LocalChangesError(
        taken.length
          ? `Already taken: ${taken.map((c) => `#${c.shortId}`).join(', ')}`
          : 'Nothing ready to claim',
        409
      )
    const existing = store.groups.find((g) => g.groupId === input.groupId)
    const group: Group = {
      groupId: input.groupId ?? randomUUID(),
      projectId: LOCAL_PROJECT_ID,
      title: input.title ?? existing?.title ?? wanted[0]!.title,
      claimedBy: input.claimedBy,
      claimExpiresAt: new Date(
        now.getTime() + (input.leaseMinutes ?? 30) * 60_000
      ),
      createdAt: existing?.createdAt ?? now,
      creates: input.creates ?? existing?.creates,
      alters: input.alters ?? existing?.alters,
      reads: input.reads ?? existing?.reads,
      needsPlan: input.needsPlan ?? existing?.needsPlan,
    }
    const clash = conflicts(store, group, now)
    if (clash) throw new LocalChangesError(clash, 409)
    store.groups = store.groups.filter((g) => g.groupId !== group.groupId)
    store.groups.push(group)
    for (const change of wanted) change.groupId = group.groupId
    return { group, changes: wanted }
  },

  completeChange: (store, input) => {
    const change = find(store, input.changeId)
    change.status = 'done'
    delete change.ask
    change.branch = input.branch ?? null
    change.headCommit = input.headCommit ?? null
    change.resolvedAt = new Date()
    if (input.note)
      message(store, change, 'agent', input.authorName ?? 'agent', input.note)
    return { change }
  },

  askChangeQuestion: (store, input) => {
    const change = find(store, input.changeId)
    park(change, 'question', input.authorName)
    return {
      message: message(
        store,
        change,
        'agent',
        input.authorName,
        input.question,
        (input.attachments ?? []).map((a) => ({ ...a, url: null }))
      ),
    }
  },

  replyToChange: (store, input) => {
    const change = find(store, input.changeId)
    if (input.person && change.status === 'needs_answer') {
      change.status = 'in_progress'
      delete change.ask
    }
    return {
      message: message(
        store,
        change,
        input.person ? 'user' : 'agent',
        input.authorName,
        input.body
      ),
    }
  },

  attachChangeShot: (store, input) => {
    const change = find(store, input.changeId)
    park(change, 'visual', input.authorName)
    return {
      message: message(store, change, 'agent', input.authorName, input.label),
      key: '',
    }
  },
}

export async function releaseChangeset(
  path: string,
  groupId: string
): Promise<void> {
  await withStore(path, (store) => {
    const group = store.groups.find((g) => g.groupId === groupId)
    if (group) group.claimExpiresAt = new Date()
  })
}

export function localChangesRPC(path: string): ChangesRPC {
  const invoke = async (name: string, data: unknown) => {
    const handler = (
      handlers as Record<string, (store: Store, data: unknown) => unknown>
    )[name]
    if (!handler)
      throw new LocalChangesError(
        `${name} needs a cloud project; this checkout uses the local changes queue.`,
        501
      )
    return withStore(path, (store) => handler(store, data))
  }
  return { invoke: invoke as ChangesRPC['invoke'] }
}
