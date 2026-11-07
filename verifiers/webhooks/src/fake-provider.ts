import { LocalVariablesService } from '@pikku/core/services'
import {
  createScriptContent,
  getText,
  hasKey,
  putText,
} from './script-content.js'

/**
 * A provider's webhook endpoints, kept in a file so a `pikku webhooks` run in
 * another process sees what this one registered.
 */
export type FakeEndpoint = {
  id: string
  url: string
  label: string
  events: string[]
  secret: string
}

const store = () => {
  const dir = new LocalVariablesService().get<string>('WEBHOOK_SCRATCH_DIR')
  if (!dir) throw new Error('WEBHOOK_SCRATCH_DIR is not set')
  return createScriptContent(dir)
}

export const readEndpoints = async (): Promise<FakeEndpoint[]> => {
  const content = store()
  return (await hasKey(content, 'provider', 'endpoints.json'))
    ? JSON.parse(await getText(content, 'provider', 'endpoints.json'))
    : []
}

export const writeEndpoints = (endpoints: FakeEndpoint[]) =>
  putText(
    store(),
    'provider',
    'endpoints.json',
    JSON.stringify(endpoints, null, 2)
  )
