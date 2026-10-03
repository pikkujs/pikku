import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { generateWishDeck } from './wish-deck.js'
import {
  getFabricRPC,
  resolveApiContext,
  type FabricRPC,
  type ListChangesOutput,
} from '@pikku/cli/fabric'

export type StudioMode = 'local' | 'fabric'

export type ChangeStatus =
  | 'open'
  | 'claimed'
  | 'needs_answer'
  | 'in_progress'
  | 'done'
  | 'dismissed'

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

export interface StudioWish {
  title: string
  line: string
  reaction: 'liked' | 'disliked' | null
}

export interface ChangesStore {
  list(status?: ChangeStatus[]): Promise<StudioChange[]>
  get(changeId: string): Promise<StudioChange | null>
  create(input: { title: string; body?: string; route?: string }): Promise<StudioChange>
  setStatus(changeId: string, status: 'open' | 'in_progress' | 'dismissed'): Promise<StudioChange>
  complete(changeId: string, note?: string): Promise<StudioChange>
  reply(changeId: string, body: string, authorName: string): Promise<void>
}

export interface WishList {
  wishes: StudioWish[]
  status: 'ready' | 'generating' | 'unavailable'
  reason?: string
}

export interface WishStore {
  list(): Promise<WishList>
  react(title: string, reaction: 'liked' | 'disliked' | null): Promise<void>
}

export interface ModelAccess {
  proxyUrl: string
  apiKey: string
  model: string
}

export interface StudioProject {
  name: string | null
  idea: string | null
}

export interface StudioHost {
  mode: StudioMode
  projectId: string | null
  changes: ChangesStore
  wishes: WishStore
  models(): Promise<ModelAccess | null>
  project(): Promise<StudioProject>
  updateProject(patch: Partial<StudioProject>): Promise<StudioProject>
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

type FabricChange = Pick<
  ListChangesOutput['changes'][number],
  'changeId' | 'shortId' | 'title' | 'body' | 'status' | 'source' | 'route' | 'createdAt'
>

const fromFabric = (c: FabricChange): StudioChange => ({
  changeId: c.changeId,
  shortId: c.shortId,
  title: c.title,
  body: c.body,
  status: c.status,
  source: c.source,
  route: c.route,
  createdAt: new Date(c.createdAt).toISOString(),
})

export class FabricChangesStore implements ChangesStore {
  constructor(
    private rpc: FabricRPC,
    private projectId: string
  ) {}

  async list(status?: ChangeStatus[]) {
    const { changes } = await this.rpc.invoke('listChanges', {
      projectId: this.projectId,
      status,
      includeDone: status?.includes('done'),
    })
    return changes.map(fromFabric)
  }

  async get(changeId: string) {
    const { change } = await this.rpc.invoke('getChange', {
      changeId,
      projectId: this.projectId,
    })
    return change ? fromFabric(change) : null
  }

  async create(): Promise<StudioChange> {
    throw new Error('Changes on a linked project are filed from its stage in Fabric')
  }

  async setStatus(changeId: string, status: 'open' | 'in_progress' | 'dismissed') {
    const { change } = await this.rpc.invoke('setChangeStatus', { changeId, status })
    return fromFabric(change)
  }

  async complete(changeId: string, note?: string) {
    const { change } = await this.rpc.invoke('completeChange', {
      changeId,
      projectId: this.projectId,
      note,
    })
    return fromFabric(change)
  }

  async reply(changeId: string, body: string, authorName: string) {
    await this.rpc.invoke('replyToChange', {
      changeId,
      projectId: this.projectId,
      body,
      authorName,
    })
  }
}

export class LocalProjectFile {
  private path: string

  constructor(projectRoot: string) {
    this.path = join(projectRoot, STUDIO_DIR, 'project.json')
  }

  read() {
    return readJson<StudioProject>(this.path, { name: null, idea: null })
  }

  async update(patch: Partial<StudioProject>) {
    const next = { ...(await this.read()), ...patch }
    await writeJson(this.path, next)
    return next
  }
}

interface LocalWishFile {
  wishes: StudioWish[]
  error?: string
}

export class LocalWishStore implements WishStore {
  private path: string
  private generating: Promise<void> | null = null

  constructor(
    private projectRoot: string,
    private models: () => Promise<ModelAccess | null> = async () => null,
    private project = new LocalProjectFile(projectRoot)
  ) {
    this.path = join(projectRoot, STUDIO_DIR, 'wishes.json')
  }

  private read() {
    return readJson<LocalWishFile>(this.path, { wishes: [] })
  }

  async save(wishes: StudioWish[]) {
    await writeJson(this.path, { wishes })
  }

  private async source() {
    const knowledgePath = join(this.projectRoot, 'knowledge', 'index.md')
    if (existsSync(knowledgePath)) {
      return { knowledge: await readFile(knowledgePath, 'utf8') }
    }
    const { idea, name } = await this.project.read()
    return idea || name ? { idea: idea || name! } : null
  }

  async list(): Promise<WishList> {
    const file = await this.read()
    if (file.wishes.length) return { wishes: file.wishes, status: 'ready' }
    if (this.generating) return { wishes: [], status: 'generating' }
    const source = await this.source()
    if (!source) {
      return { wishes: [], status: 'unavailable', reason: 'no-idea' }
    }
    const access = await this.models()
    if (!access) {
      const reason = process.env.PIKKU_STUDIO_AI === 'subscription' ? 'subscription' : 'no-model'
      return { wishes: [], status: 'unavailable', reason }
    }
    if (file.error) {
      return { wishes: [], status: 'unavailable', reason: file.error }
    }
    this.generating = this.generate(access, source).finally(() => {
      this.generating = null
    })
    return { wishes: [], status: 'generating' }
  }

  private async generate(
    access: ModelAccess,
    source: { idea?: string; knowledge?: string }
  ) {
    try {
      const deck = await generateWishDeck(access, source, [])
      const project = await this.project.read()
      if (!project.name && deck.name) await this.project.update({ name: deck.name })
      await this.save(
        deck.aspirations.map(({ title, line }) => ({ title, line, reaction: null }))
      )
    } catch (e) {
      await writeJson(this.path, { wishes: [], error: (e as Error).message })
    }
  }

  async retry() {
    await this.save([])
  }

  async react(title: string, reaction: 'liked' | 'disliked' | null) {
    const { wishes } = await this.read()
    const wish = wishes.find((w) => w.title === title)
    if (!wish) throw new Error(`No wish "${title}"`)
    wish.reaction = reaction
    await this.save(wishes)
  }
}

export class FabricWishStore implements WishStore {
  private sourceDigest: string | null = null

  constructor(
    private rpc: FabricRPC,
    private projectId: string
  ) {}

  async list(): Promise<WishList> {
    const toWishes = (rows: StudioWish[]) =>
      rows.map(({ title, line, reaction }) => ({ title, line, reaction }))
    if (this.sourceDigest) {
      const { aspirations } = await this.rpc.invoke('getProjectAspirations', {
        projectId: this.projectId,
        sourceDigest: this.sourceDigest,
      })
      if (aspirations.length) return { wishes: toWishes(aspirations), status: 'ready' }
      return { wishes: [], status: 'generating' }
    }
    const { aspirations, sourceDigest, status } = await this.rpc.invoke(
      'ensureProjectAspirations',
      { projectId: this.projectId }
    )
    this.sourceDigest = status === 'generating' ? sourceDigest : null
    return { wishes: toWishes(aspirations), status }
  }

  async react(title: string, reaction: 'liked' | 'disliked' | null) {
    await this.rpc.invoke('reactToProjectAspiration', {
      projectId: this.projectId,
      title,
      reaction,
    })
  }
}

const localModels = async (): Promise<ModelAccess | null> => {
  if (process.env.PIKKU_STUDIO_AI === 'key' && process.env.PIKKU_STUDIO_AI_KEY) {
    return {
      proxyUrl: process.env.PIKKU_STUDIO_AI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: process.env.PIKKU_STUDIO_AI_KEY,
      model: process.env.PIKKU_STUDIO_MODEL ?? 'gpt-4.1-mini',
    }
  }
  if (process.env.PIKKU_STUDIO_AI) return null
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return {
    proxyUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey,
    model: process.env.PIKKU_STUDIO_MODEL ?? 'gpt-4.1-mini',
  }
}

const fabricModels = (rpc: FabricRPC) => async (): Promise<ModelAccess | null> => ({
  ...(await rpc.invoke('getDeveloperLiteLLMKey', {})),
  model: process.env.PIKKU_STUDIO_MODEL ?? 'gemini-flash-lite-latest',
})

export async function resolveStudioHost(projectRoot: string): Promise<StudioHost> {
  const project = new LocalProjectFile(projectRoot)
  const projectApi = {
    project: () => project.read(),
    updateProject: (patch: Partial<StudioProject>) => project.update(patch),
  }
  const ctx = await resolveApiContext({ startDir: projectRoot }).catch(() => null)
  if (ctx?.token && ctx.projectId) {
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    return {
      mode: 'fabric',
      projectId: ctx.projectId,
      changes: new FabricChangesStore(rpc, ctx.projectId),
      wishes: new FabricWishStore(rpc, ctx.projectId),
      models: fabricModels(rpc),
      ...projectApi,
    }
  }
  const models =
    process.env.PIKKU_STUDIO_AI === 'fabric' && ctx?.token
      ? fabricModels(getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token }))
      : localModels
  return {
    mode: 'local',
    projectId: null,
    changes: new LocalChangesStore(projectRoot),
    wishes: new LocalWishStore(projectRoot, models, project),
    models,
    ...projectApi,
  }
}
