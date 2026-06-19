import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'
import { pikkuAIMiddleware } from '../../types/core.types.js'
import type { AIContentPart } from './ai-agent.types.js'

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const MAX_AUDIO_SIZE = 50 * 1024 * 1024

// Portable SSRF guard: @pikku/core runs in edge runtimes (CF Workers) with no
// Node `dns`, so we cannot resolve hostnames to check for private targets.
// Reject the obvious internal literals; callers wanting stricter control pass
// an explicit `allowedAudioHosts` allowlist. (Does not defend against a public
// hostname that resolves to a private IP / DNS rebinding — out of reach here.)
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd'))
    return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}

async function fetchAsUint8Array(
  url: string,
  allowedAudioHosts?: string[]
): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) URLs are supported for audio')
  }
  if (allowedAudioHosts) {
    if (!allowedAudioHosts.includes(parsed.hostname)) {
      throw new Error(`Audio URL host is not allowed: ${parsed.hostname}`)
    }
  } else if (isPrivateHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch audio from a private/internal host: ${parsed.hostname}`
    )
  }
  const response = await fetch(url)
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
    throw new Error('Audio file exceeds maximum size')
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_AUDIO_SIZE) {
    throw new Error('Audio file exceeds maximum size')
  }
  return new Uint8Array(buffer)
}

export const voiceInput = (config?: {
  language?: string
  model?: string
  allowedAudioHosts?: string[]
}) =>
  pikkuAIMiddleware({
    modifyInput: async (services, { messages, instructions }) => {
      const transcribeAudio = (services as {
        aiAgentRunner?: AIAgentRunnerService
      }).aiAgentRunner?.transcribe
      if (!transcribeAudio) return { messages, instructions }

      const last = messages[messages.length - 1]
      if (!last || last.role !== 'user' || typeof last.content === 'string') {
        return { messages, instructions }
      }

      const parts = last.content as AIContentPart[]
      if (!parts) return { messages, instructions }

      const hasAudio = parts.some(
        (p) => p.type === 'file' && !!p.mediaType?.startsWith('audio/')
      )
      if (!hasAudio) return { messages, instructions }

      // Process parts in order, replacing each audio part with its transcription
      // in place. Sequential, so no unbounded parallel downloads/transcriptions
      // and original content ordering is preserved.
      const updatedContent: AIContentPart[] = []
      for (const p of parts) {
        if (!(p.type === 'file' && p.mediaType?.startsWith('audio/'))) {
          updatedContent.push(p)
          continue
        }
        if (!config?.model) {
          throw new Error(
            'voiceInput requires a transcription model (e.g. openai/whisper-1)'
          )
        }
        const audioData = p.data
          ? base64ToUint8Array(p.data)
          : await fetchAsUint8Array(p.url!, config.allowedAudioHosts)
        const result = await transcribeAudio({
          model: config.model,
          audio: audioData,
          ...(config.language
            ? {
                providerOptions: {
                  openai: {
                    language: config.language,
                  },
                },
              }
            : {}),
        })
        updatedContent.push({ type: 'text' as const, text: result.text })
      }

      return {
        messages: [
          ...messages.slice(0, -1),
          { ...last, content: updatedContent },
        ],
        instructions,
      }
    },
  })
