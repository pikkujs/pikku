import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface KeyProvider {
  id: string
  name: string
  envVar: string
  baseUrl: string
  model: string
}

export interface SubscriptionProvider {
  id: string
  name: string
  piLogin: string
}

export const KEY_PROVIDERS: KeyProvider[] = [
  { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'anthropic', name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5' },
  { id: 'gemini', name: 'Google Gemini', envVar: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash-lite' },
  { id: 'xai', name: 'xAI (Grok)', envVar: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  { id: 'mistral', name: 'Mistral', envVar: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'groq', name: 'Groq', envVar: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
]

export const SUBSCRIPTION_PROVIDERS: SubscriptionProvider[] = [
  { id: 'openai-codex', name: 'ChatGPT Plus or Pro', piLogin: 'ChatGPT Plus/Pro (Codex)' },
  { id: 'xai', name: 'Grok (X subscription)', piLogin: 'xAI (Grok/X subscription)' },
  { id: 'github-copilot', name: 'GitHub Copilot', piLogin: 'GitHub Copilot' },
]

export type AiChoice =
  | { kind: 'key'; provider: string; model: string }
  | { kind: 'subscription'; provider: string }
  | { kind: 'fabric' }

export type AiInput =
  | { kind: 'key'; provider: string; apiKey: string; model?: string }
  | { kind: 'subscription'; provider: string }
  | { kind: 'fabric' }

export class StudioAi {
  constructor(private home: string) {}

  private get choicePath() {
    return join(this.home, 'ai.json')
  }

  private get keysPath() {
    return join(this.home, 'ai-keys.json')
  }

  async choice(): Promise<AiChoice | null> {
    if (!existsSync(this.choicePath)) return null
    return JSON.parse(await readFile(this.choicePath, 'utf8')).choice ?? null
  }

  private async keys(): Promise<Record<string, string>> {
    if (!existsSync(this.keysPath)) return {}
    return JSON.parse(await readFile(this.keysPath, 'utf8'))
  }

  async set(input: AiInput): Promise<AiChoice> {
    let choice: AiChoice
    if (input.kind === 'key') {
      const provider = KEY_PROVIDERS.find((p) => p.id === input.provider)
      if (!provider) throw new Error(`Studio does not know ${input.provider}`)
      const apiKey = input.apiKey.trim()
      if (!apiKey) throw new Error('Paste the key first')
      const keys = await this.keys()
      keys[provider.id] = apiKey
      await mkdir(this.home, { recursive: true })
      await writeFile(this.keysPath, JSON.stringify(keys, null, 2) + '\n', { mode: 0o600 })
      await chmod(this.keysPath, 0o600)
      choice = { kind: 'key', provider: provider.id, model: input.model?.trim() || provider.model }
    } else if (input.kind === 'subscription') {
      if (!SUBSCRIPTION_PROVIDERS.some((p) => p.id === input.provider)) {
        throw new Error(`Studio cannot use a ${input.provider} subscription`)
      }
      choice = { kind: 'subscription', provider: input.provider }
    } else {
      choice = { kind: 'fabric' }
    }
    await mkdir(this.home, { recursive: true })
    await writeFile(this.choicePath, JSON.stringify({ choice }, null, 2) + '\n')
    return choice
  }

  async clear() {
    await mkdir(this.home, { recursive: true })
    await writeFile(this.choicePath, JSON.stringify({ choice: null }, null, 2) + '\n')
  }

  async env(): Promise<Record<string, string>> {
    const choice = await this.choice()
    if (!choice) return {}
    if (choice.kind === 'fabric') return { PIKKU_STUDIO_AI: 'fabric' }
    if (choice.kind === 'subscription') {
      return { PIKKU_STUDIO_AI: 'subscription', PIKKU_STUDIO_AI_PROVIDER: choice.provider }
    }
    const provider = KEY_PROVIDERS.find((p) => p.id === choice.provider)!
    const apiKey = (await this.keys())[provider.id]
    if (!apiKey) return {}
    return {
      PIKKU_STUDIO_AI: 'key',
      PIKKU_STUDIO_AI_PROVIDER: provider.id,
      PIKKU_STUDIO_AI_KEY: apiKey,
      PIKKU_STUDIO_AI_BASE_URL: provider.baseUrl,
      PIKKU_STUDIO_MODEL: choice.model,
      [provider.envVar]: apiKey,
    }
  }
}
