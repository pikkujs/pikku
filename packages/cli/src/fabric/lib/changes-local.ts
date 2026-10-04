import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { git } from '../../utils/git.js'
import { FabricPreconditionError } from './errors.js'
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
} from '../sdk/rpc-map.gen.d.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

export const LOCAL_PROJECT_ID = 'local'
const LOCAL_STAGE_ID = 'local'
const STORE_FILE = 'pikku-changes.json'

type Change = ListChangesOutput['changes'][number]

export type Declaration = {
  creates: string[]
  alters: string[]
  reads: string[]
  needsPlan: boolean
}

type Group = ListChangesOutput['groups'][number] & Partial<Declaration>
type Message = GetChangeOutput['thread'][number]

type Store = {
  nextShortId: number
  changes: Change[]
  groups: Group[]
  messages: Message[]
  fabric?: FabricLinks
}

export type FabricLinks = {
  changes: Record<string, string>
  groups: Record<string, string>
}

type LocalMap = {
  listChanges: [ListChangesInput, ListChangesOutput]
  getChange: [GetChangeInput, GetChangeOutput]
  createChange: [CreateChangeInput, CreateChangeOutput]
  claimChanges: [ClaimChangesInput, ClaimChangesOutput]
  completeChange: [CompleteChangeInput, CompleteChangeOutput]
  askChangeQuestion: [AskChangeQuestionInput, AskChangeQuestionOutput]
  replyToChange: [ReplyToChangeInput, ReplyToChangeOutput]
  attachChangeShot: [AttachChangeShotInput, AttachChangeShotOutput]
}

export type ChangesRPC = Pick<PikkuRPC, 'invoke'>

const DATES = new Set([
  'createdAt',
  'claimExpiresAt',
  'resolvedAt',
  'acknowledgedAt',
  'heldUntil',
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
  const dir = await git(['rev-parse', '--git-common-dir'], cwd)
  return join(isAbsolute(dir) ? dir : join(cwd, dir), STORE_FILE)
}

async function read(path: string): Promise<Store> {
  try {
    return JSON.parse(await readFile(path, 'utf8'), (key, value) =>
      DATES.has(key) && typeof value === 'string' ? new Date(value) : value
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { nextShortId: 1, changes: [], groups: [], messages: [] }
  }
}

async function withStore<T>(path: string, fn: (store: Store) => T): Promise<T> {
  const lock = `${path}.lock`
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
        throw new FabricPreconditionError(
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

const handlers: {
  [N in keyof LocalMap]: (store: Store, data: LocalMap[N][0]) => LocalMap[N][1]
} = {
  listChanges: (store, input) => {
    const changes = store.changes.filter(
      (c) =>
        (!input.status || input.status.includes(c.status)) &&
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
    const change: Change = {
      changeId: randomUUID(),
      shortId: String(store.nextShortId++),
      projectId: LOCAL_PROJECT_ID,
      stageId: LOCAL_STAGE_ID,
      groupId: null,
      title: input.title,
      body: input.body ?? null,
      status: 'open',
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

  claimChanges: (store, input: ClaimChangesInput & Partial<Declaration>) => {
    const now = new Date()
    const wanted = input.changeIds?.length
      ? input.changeIds.map((ref) => find(store, ref))
      : store.changes.filter((c) => c.status === 'open')
    const taken = wanted.filter(
      (c) =>
        (c.status !== 'open' && c.status !== 'claimed') ||
        (leaseLive(store, c, now) && c.groupId !== input.groupId)
    )
    if (!wanted.length || taken.length)
      throw new LocalChangesError(
        taken.length
          ? `Already taken: ${taken.map((c) => `#${c.shortId}`).join(', ')}`
          : 'Nothing open to claim',
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
    for (const change of wanted) {
      change.groupId = group.groupId
      change.status = 'claimed'
    }
    return { group, changes: wanted }
  },

  completeChange: (store, input) => {
    const change = find(store, input.changeId)
    change.status = 'done'
    change.branch = input.branch ?? null
    change.headCommit = input.headCommit ?? null
    change.resolvedAt = new Date()
    if (input.note)
      message(store, change, 'agent', input.authorName ?? 'agent', input.note)
    return { change }
  },

  askChangeQuestion: (store, input) => {
    const change = find(store, input.changeId)
    change.status = 'needs_answer'
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
    return {
      message: message(store, change, 'agent', input.authorName, input.body),
    }
  },

  attachChangeShot: (store, input) => {
    const change = find(store, input.changeId)
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

export async function fabricLinks(path: string): Promise<FabricLinks> {
  return (await read(path)).fabric ?? { changes: {}, groups: {} }
}

export async function linkFabric(
  path: string,
  kind: keyof FabricLinks,
  localId: string,
  fabricId: string
): Promise<void> {
  await withStore(path, (store) => {
    store.fabric ??= { changes: {}, groups: {} }
    store.fabric[kind][localId] = fabricId
  })
}

export function localChangesRPC(path: string): ChangesRPC {
  const invoke = async (name: string, data: unknown) => {
    const handler = (
      handlers as Record<string, (store: Store, data: unknown) => unknown>
    )[name]
    if (!handler)
      throw new LocalChangesError(
        `${name} needs a fabric project; this checkout uses the local changes queue.`,
        501
      )
    return withStore(path, (store) => handler(store, data))
  }
  return { invoke: invoke as PikkuRPC['invoke'] }
}
