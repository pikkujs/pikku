import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const HttpRequestInput = z.object({
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .default('GET')
    .describe('HTTP method'),
  url: z.string().describe('The request URL'),
  headers: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Request headers'),
  query: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Query string parameters appended to the URL'),
  body: z
    .unknown()
    .optional()
    .describe('Request body — JSON-encoded unless it is already a string'),
})

/**
 * The parsed response body, exposed directly as the output so downstream graph
 * nodes can reference its fields. A non-object response (array, string, number)
 * is wrapped under `data`.
 */
export const HttpRequestOutput = z
  .record(z.string(), z.unknown())
  .describe('Parsed JSON response body')

export const httpRequest = pikkuSessionlessFunc({
  description: 'Perform an HTTP request and return the response body',
  node: { displayName: 'HTTP Request', category: 'Data', type: 'action' },
  input: HttpRequestInput,
  output: HttpRequestOutput,
  func: async (_services, data) => {
    const url = new URL(data.url)
    for (const [key, value] of Object.entries(data.query ?? {})) {
      url.searchParams.set(key, String(value))
    }

    const sendsBody =
      data.body !== undefined && data.method !== 'GET' && data.method !== 'HEAD'
    const bodyIsString = typeof data.body === 'string'

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(data.headers ?? {})) {
      headers[key] = String(value)
    }
    if (sendsBody && !bodyIsString && !('content-type' in headers)) {
      headers['content-type'] = 'application/json'
    }

    const response = await fetch(url, {
      method: data.method,
      headers,
      body: sendsBody
        ? bodyIsString
          ? (data.body as string)
          : JSON.stringify(data.body)
        : undefined,
    })

    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      // not JSON — keep the raw text
    }

    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { data: parsed }
  },
})
