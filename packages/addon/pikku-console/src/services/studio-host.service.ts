import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  getCloudRPC,
  resolveApiContext,
  type CloudRPC,
  type ListChangesOutput,
} from '@pikku/cli/cloud-client'

export type StudioMode = 'local' | 'cloud'

export type ChangeStatus =
  'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'

export interface StudioChange {
  changeId: string
  shortId: string
  title: string
  body: string | null
  status: ChangeStatus
  source: 'panel' | 'console' | 'system' | 'studio'
  route: string | null
  createdAt: string
}

export interface StudioChangeMessage {
  messageId: string
  changeId: string
  authorName: string
  body: string
  createdAt: string
}

export interface ChangesStore {
  list(status?: ChangeStatus[]): Promise<StudioChange[]>
  get(changeId: string): Promise<StudioChange | null>
  create(input: {
    title: string
    body?: string
    route?: string
  }): Promise<StudioChange>
  setStatus(
    changeId: string,
    status: 'open' | 'in_progress' | 'dismissed'
  ): Promise<StudioChange>
  complete(changeId: string, note?: string): Promise<StudioChange>
  reply(changeId: string, body: string, authorName: string): Promise<void>
}

export interface StudioHost {
  mode: StudioMode
  projectId: string | null
  changes: ChangesStore
}

const STUDIO_DIR = '.studio'

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

interface LocalChangesFile {
  changes: StudioChange[]
  messages: StudioChangeMessage[]
}

export class LocalChangesStore implements ChangesStore {
  private path: string

  constructor(projectRoot: string) {
    this.path = join(projectRoot, STUDIO_DIR, 'changes.json')
  }

  private read() {
    return readJson<LocalChangesFile>(this.path, { changes: [], messages: [] })
  }

  private async update(changeId: string, patch: Partial<StudioChange>) {
    const file = await this.read()
    const change = file.changes.find((c) => c.changeId === changeId)
    if (!change) throw new Error(`No change ${changeId}`)
    Object.assign(change, patch)
    await writeJson(this.path, file)
    return change
  }

  async list(status?: ChangeStatus[]) {
    const { changes } = await this.read()
    return status ? changes.filter((c) => status.includes(c.status)) : changes
  }

  async get(changeId: string) {
    const { changes } = await this.read()
    return changes.find((c) => c.changeId === changeId) ?? null
  }

  async create(input: { title: string; body?: string; route?: string }) {
    const file = await this.read()
    const changeId = randomUUID()
    const change: StudioChange = {
      changeId,
      shortId: changeId.slice(0, 8),
      title: input.title,
      body: input.body ?? null,
      status: 'open',
      source: 'studio',
      route: input.route ?? null,
      createdAt: new Date().toISOString(),
    }
    file.changes.push(change)
    await writeJson(this.path, file)
    return change
  }

  setStatus(changeId: string, status: 'open' | 'in_progress' | 'dismissed') {
    return this.update(changeId, { status })
  }

  async complete(changeId: string, note?: string) {
    if (note) await this.reply(changeId, note, 'studio')
    return this.update(changeId, { status: 'done' })
  }

  async reply(changeId: string, body: string, authorName: string) {
    const file = await this.read()
    file.messages.push({
      messageId: randomUUID(),
      changeId,
      authorName,
      body,
      createdAt: new Date().toISOString(),
    })
    await writeJson(this.path, file)
  }
}

type CloudChange = Pick<
  ListChangesOutput['changes'][number],
  | 'changeId'
  | 'shortId'
  | 'title'
  | 'body'
  | 'status'
  | 'source'
  | 'route'
  | 'createdAt'
>

const fromCloud = (c: CloudChange): StudioChange => ({
  changeId: c.changeId,
  shortId: c.shortId,
  title: c.title,
  body: c.body,
  status: c.status,
  source: c.source,
  route: c.route,
  createdAt: new Date(c.createdAt).toISOString(),
})

export class CloudChangesStore implements ChangesStore {
  constructor(
    private rpc: CloudRPC,
    private projectId: string
  ) {}

  async list(status?: ChangeStatus[]) {
    const { changes } = await this.rpc.invoke('cloud:listChanges', {
      projectId: this.projectId,
      status,
      includeDone: status?.includes('done'),
    })
    return changes.map(fromCloud)
  }

  async get(changeId: string) {
    const { change } = await this.rpc.invoke('cloud:getChange', {
      changeId,
      projectId: this.projectId,
    })
    return change ? fromCloud(change) : null
  }

  async create(): Promise<StudioChange> {
    throw new Error(
      'Changes on a linked project are filed from its stage in Pikku Studio Cloud'
    )
  }

  async setStatus(
    changeId: string,
    status: 'open' | 'in_progress' | 'dismissed'
  ) {
    const { change } = await this.rpc.invoke('cloud:setChangeStatus', {
      changeId,
      status,
    })
    return fromCloud(change)
  }

  async complete(changeId: string, note?: string) {
    const { change } = await this.rpc.invoke('cloud:completeChange', {
      changeId,
      projectId: this.projectId,
      note,
    })
    return fromCloud(change)
  }

  async reply(changeId: string, body: string, authorName: string) {
    await this.rpc.invoke('cloud:replyToChange', {
      changeId,
      projectId: this.projectId,
      body,
      authorName,
    })
  }
}

export async function resolveStudioHost(
  projectRoot: string
): Promise<StudioHost> {
  const ctx = await resolveApiContext({ startDir: projectRoot }).catch(
    () => null
  )
  if (ctx?.token && ctx.projectId) {
    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    return {
      mode: 'cloud',
      projectId: ctx.projectId,
      changes: new CloudChangesStore(rpc, ctx.projectId),
    }
  }
  return {
    mode: 'local',
    projectId: null,
    changes: new LocalChangesStore(projectRoot),
  }
}
