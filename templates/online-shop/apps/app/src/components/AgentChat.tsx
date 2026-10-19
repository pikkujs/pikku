import { useState, type FC } from 'react'
import { Alert, Button, Card, Group, Stack, Text, Textarea } from '@pikku/mantine/core'
import { apiUrl } from '@/lib/env'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export type AgentKey = 'shop' | 'ops' | 'checkout'

/**
 * One chat surface, three agents.
 *
 * This was the body of `AssistantPage`, hardcoded to `/agents/shop`. That is why
 * `opsAgent` and `checkoutAssistant` had no screen: the only agent UI in the app
 * could talk to exactly one agent, so wiring a second one had nowhere to go.
 *
 * A raw fetch rather than the generated client: an agent route is not in the RPC
 * map, so there is no `usePikkuMutation('...')` for it.
 *
 * The route and the copy are chosen from a map keyed on the agent rather than
 * assembled from a string. A key built at runtime cannot be type-checked, so a
 * renamed message would degrade to a console warning instead of a build failure.
 */
const ROUTE: Record<AgentKey, string> = {
  shop: '/agents/shop',
  ops: '/agents/ops',
  checkout: '/agents/checkout',
}

const PLACEHOLDER: Record<AgentKey, (typeof m)['assistant__placeholder']> = {
  shop: m.assistant__placeholder,
  ops: m.assistant__ops_placeholder,
  checkout: m.assistant__checkout_placeholder,
}

type Props = {
  agent: AgentKey
}

export const AgentChat: FC<Props> = ({ agent }) => {
  useLocale()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const ask = async () => {
    if (!question.trim()) return
    setPending(true)
    setFailed(false)
    setAnswer(null)
    try {
      const response = await fetch(`${apiUrl()}${ROUTE[agent]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: [{ role: 'user', content: question.trim() }] }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { content?: string; message?: string }
      setAnswer(body.content ?? body.message ?? JSON.stringify(body))
    } catch {
      // Almost always the missing provider key rather than a broken route, so
      // say the thing a reader can act on instead of a status code.
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  const placeholder = PLACEHOLDER[agent]()

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Textarea
          placeholder={placeholder}
          aria-label={placeholder}
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group>
          <Button loading={pending} disabled={!question.trim()} onClick={() => void ask()}>
            {pending ? m.assistant__thinking() : m.assistant__send()}
          </Button>
        </Group>

        {failed && (
          <Alert color="yellow" variant="light">
            {m.assistant__unavailable()}
          </Alert>
        )}

        {answer && (
          <Card withBorder radius="sm" padding="md" bg="var(--mantine-color-default-hover)">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {asI18n(answer)}
            </Text>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
