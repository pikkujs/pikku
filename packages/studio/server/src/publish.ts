import { spawn } from 'node:child_process'
import type { StudioProjectsService } from './projects.js'

export type PromptTarget = 'standalone' | 'cloudflare' | 'serverless' | 'azure'

export type FabricReadiness = 'ready' | 'sign-in' | 'not-in-fabric'

export interface PublishJob {
  state: 'idle' | 'running' | 'done' | 'failed'
  url: string | null
  error: string | null
  log: string[]
}

export type Runner = (command: string, args: string[], cwd: string, onLine: (line: string) => void) => Promise<void>

const runner: Runner = (command, args, cwd, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let pending = ''
    const feed = (chunk: Buffer) => {
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) onLine(line)
    }
    child.stdout.on('data', feed)
    child.stderr.on('data', feed)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (pending.trim()) onLine(pending)
      code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ''} exited with ${code}`))
    })
  })

const PROVIDER = {
  standalone: '@pikku/deploy-standalone',
  cloudflare: '@pikku/deploy-cloudflare',
  serverless: '@pikku/deploy-serverless',
  azure: '@pikku/deploy-azure',
} as const

const setup = (target: PromptTarget) =>
  [
    `1. Add \`${PROVIDER[target]}\` as a dev dependency with the project's package manager.`,
    `2. In \`pikku.config.json\`, add \`"deploy": { "providers": { "${target}": "${PROVIDER[target]}" }, "defaultProvider": "${target}" }\`, keeping any providers already listed.`,
  ].join('\n')

export const publishPrompt = (target: PromptTarget, name: string) => {
  const intro = `Set up the Pikku project "${name}" in this folder so it can be published`
  if (target === 'standalone') {
    return `${intro} as a standalone server.

${setup('standalone')}
3. Run \`npx pikku deploy apply --provider standalone\`. It builds one bundle at \`.deploy/standalone/<app>-dist/bundle.js\`.
4. Start it with \`node .deploy/standalone/<app>-dist/bundle.js\` and check the app answers.
5. List every secret and variable the app needs (\`npx pikku deploy info --provider standalone\`) and write a short README section on running it on a server: the Node version, the environment variables, and a process manager such as systemd.

Do not change the app's functions. Stop and tell me if a step fails.`
  }
  if (target === 'cloudflare') {
    return `${intro} to Cloudflare Workers.

${setup('cloudflare')}
3. Ask me for a Cloudflare account ID and an API token with Workers, Queues, D1 and R2 edit rights. Put them in the environment as \`CLOUDFLARE_ACCOUNT_ID\` and \`CLOUDFLARE_API_TOKEN\`, never in a file that is committed.
4. Run \`npx pikku deploy plan --provider cloudflare\` and show me what it will create.
5. When I agree, run \`npx pikku deploy apply --provider cloudflare\` and give me the address it prints.
6. Set every secret the plan lists with Cloudflare, asking me for each value.

Do not change the app's functions. Stop and tell me if a step fails.`
  }
  if (target === 'serverless') {
    return `${intro} to AWS Lambda with the Serverless Framework.

${setup('serverless')}
3. Run \`npx pikku deploy apply --provider serverless\`. It writes \`serverless.yml\` and the Lambda entry points under \`.deploy/serverless\`; it does not upload anything.
4. Check that the AWS CLI is signed in (\`aws sts get-caller-identity\`). If not, ask me to sign in.
5. Show me \`.deploy/serverless/serverless.yml\`, then, when I agree, run \`npx serverless deploy\` in \`.deploy/serverless\` and give me the address it prints.
6. Put every secret the app needs into AWS, asking me for each value.

Do not change the app's functions. Stop and tell me if a step fails.`
  }
  return `${intro} to Azure Functions.

${setup('azure')}
3. Run \`npx pikku deploy apply --provider azure\`. It writes the function entry points and \`host.json\` under \`.deploy/azure\`; it does not upload anything.
4. Check that the Azure CLI is signed in (\`az account show\`) and that Azure Functions Core Tools (\`func\`) is installed. If not, tell me how to set them up.
5. Ask me which function app to publish to, or create one with me, then run \`func azure functionapp publish <app>\` in \`.deploy/azure\` and give me the address it prints.
6. Put every secret the app needs into the function app's settings, asking me for each value.

Do not change the app's functions. Stop and tell me if a step fails.`
}

export class StudioPublisher {
  private jobs = new Map<string, PublishJob>()

  constructor(
    private projects: StudioProjectsService,
    private run: Runner = runner
  ) {}

  async options(key: string) {
    const project = (await this.projects.list()).find((p) => p.key === key)
    if (!project) throw new Error('Studio does not know this project')
    const account = await this.projects.getAccount()
    const fabric: FabricReadiness = !account.signedIn
      ? 'sign-in'
      : !project.fabricProjectId
        ? 'not-in-fabric'
        : 'ready'
    const prompts = Object.fromEntries(
      (Object.keys(PROVIDER) as PromptTarget[]).map((t) => [t, publishPrompt(t, project.name)])
    ) as Record<PromptTarget, string>
    return { fabric, consoleUrl: account.consoleUrl, prompts }
  }

  status(key: string): PublishJob {
    return this.jobs.get(key) ?? { state: 'idle', url: null, error: null, log: [] }
  }

  async fabric(key: string): Promise<PublishJob> {
    if (this.status(key).state === 'running') return this.status(key)
    const { fabric } = await this.options(key)
    if (fabric !== 'ready') throw new Error('Put this project in Fabric before publishing it there')
    const { worktree } = await this.projects.open(key)
    const job: PublishJob = { state: 'running', url: null, error: null, log: [] }
    this.jobs.set(key, job)
    const onLine = (line: string) => {
      job.log.push(line)
      if (job.log.length > 200) job.log.shift()
      const url = line.match(/https:\/\/\S+/)?.[0]
      if (url) job.url = url
    }
    const steps: [string, string[]][] = [
      ['git', ['add', '-A']],
      ['git', ['-c', 'user.name=Pikku Studio', '-c', 'user.email=studio@pikku.dev', 'commit', '-q', '--allow-empty', '-m', 'Publish from Pikku Studio']],
      ['git', ['push', '-u', 'origin', 'HEAD']],
      ['npx', ['pikku', 'fabric', 'deploy', 'apply', '-y']],
    ]
    void (async () => {
      try {
        for (const [command, args] of steps) await this.run(command, args, worktree, onLine)
        job.state = 'done'
      } catch (error) {
        job.state = 'failed'
        job.error = error instanceof Error ? error.message : String(error)
      }
    })()
    return job
  }
}
