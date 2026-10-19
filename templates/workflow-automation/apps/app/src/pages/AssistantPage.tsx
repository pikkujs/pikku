import { useState, type FC } from 'react'
import { Alert, Box, Button, Card, Group, Stack, Text, Textarea, Title } from '@pikku/mantine/core'
import { m, asI18n } from '@/i18n/messages'
import { apiUrl } from '@/lib/env'
import { useLocale } from '@/i18n/config'

/**
 * The assistant, which had no way in.
 *
 * The agent is wired at `POST /agents/ops` and nothing called it, so an AI surface
 * that exists in the codebase — with its tools, its memory config and its step
 * limit — was reachable only from a test that fails without a provider key.
 *
 * A raw fetch rather than the generated client: an agent route is not in the
 * RPC map, so there is no `usePikkuMutation('...')` for it. That asymmetry is
 * worth knowing about; it is the reason this screen did not exist.
 */
export const AssistantPage: FC = () => {
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
      const response = await fetch(`${apiUrl()}/agents/ops`, {
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

  return (
    <Stack gap="lg" maw={720}>
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.assistant__title()}
        </Title>
        <Text c="dimmed" size="sm">{m.assistant__subtitle()}</Text>
      </Box>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Textarea
            placeholder={m.assistant__placeholder()}
            aria-label={m.assistant__placeholder()}
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
        </Stack>
      </Card>

      {failed && <Alert color="orange" variant="light">{m.assistant__unavailable()}</Alert>}

      {answer && (
        <Card withBorder radius="md" padding="lg">
          <Text lineBreaks style={{ lineHeight: 1.7 }}>{asI18n(answer)}</Text>
        </Card>
      )}
    </Stack>
  )
}
