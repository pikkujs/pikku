import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BuilderSession } from '@pikku/builder'
import {
  resolveDesignEntry,
  StudioAi,
  StudioProjectsService,
  StudioPublisher,
  studioHome,
  type SignInChoice,
  type StudioSettings,
} from '@pikku/studio'
import { installEmbeddedRuntime } from './runtime.js'

export class StudioSettingsFile {
  constructor(private path: string) {}

  async read(): Promise<StudioSettings> {
    if (!existsSync(this.path)) return { signIn: null }
    return { signIn: null, ...JSON.parse(await readFile(this.path, 'utf8')) }
  }

  async update(patch: Partial<StudioSettings>) {
    const next = { ...(await this.read()), ...patch }
    await mkdir(join(this.path, '..'), { recursive: true })
    await writeFile(this.path, JSON.stringify(next, null, 2) + '\n')
    return next
  }
}

export interface Studio {
  home: string
  ai: StudioAi
  projects: StudioProjectsService
  publisher: StudioPublisher
  builder: BuilderSession
  settings: StudioSettingsFile
}

export type { SignInChoice }

export async function createStudio(home = studioHome()): Promise<Studio> {
  await installEmbeddedRuntime(home)
  const ai = new StudioAi(home)
  const projects = new StudioProjectsService({
    home,
    designEntry: existsSync(resolveDesignEntry()) ? resolveDesignEntry() : undefined,
    env: () => ai.env(),
  })
  const builder = new BuilderSession(async (key) => {
    const env = await ai.env()
    const proxyUrl = process.env.PIKKU_BUILDER_PROXY_URL
    const proxyKey = process.env.PIKKU_BUILDER_PROXY_KEY
    const fabric =
      proxyUrl && proxyKey
        ? { proxyUrl, apiKey: proxyKey }
        : env.PIKKU_STUDIO_AI === 'fabric'
          ? await projects.modelAccess()
          : null
    if (!fabric && !env.PIKKU_STUDIO_AI) throw new Error('Choose your AI before building')
    const launch = await projects.builderLaunch(key)
    return {
      ...launch,
      ai: fabric
        ? {
            model: env.PIKKU_STUDIO_MODEL ?? 'gemini-flash-lite-latest',
            proxy: { url: fabric.proxyUrl, key: fabric.apiKey },
          }
        : { provider: env.PIKKU_STUDIO_AI_PROVIDER, model: env.PIKKU_STUDIO_MODEL },
      env: { ...launch.env, ...env, PIKKU_DEV_LOG: join(home, 'logs', `${key}.log`) },
    }
  }, join(home, 'builder'))
  return {
    home,
    ai,
    projects,
    publisher: new StudioPublisher(projects),
    builder,
    settings: new StudioSettingsFile(join(home, 'settings.json')),
  }
}
