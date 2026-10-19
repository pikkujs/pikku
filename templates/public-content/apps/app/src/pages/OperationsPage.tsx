import { useState, type FC } from 'react'
import { Alert, Box, Button, Card, Group, Select, Stack, Text, Title } from '@pikku/mantine/core'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { LiveFeed } from '@/components/LiveFeed'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/**
 * The jobs the schedule runs, with a way to run them now.
 *
 * `publishScheduled` fired on a cron and `publishWorkflow` fired from nothing at
 * all — three steps of real publishing logic with no caller. An editor waiting
 * on a scheduled post could only wait.
 *
 * An operations page is not a debug screen. These are the same actions the
 * schedule performs, and being able to perform them by hand is what makes them
 * observable when they misbehave — the difference between "the cron is broken"
 * and "I pressed it and here is what happened".
 */
export const OperationsPage: FC = () => {
  useLocale()
  const drafts = usePikkuQuery('listDrafts', { limit: 50 })
  const publishDue = usePikkuMutation('publishScheduled')
  const startPublish = usePikkuMutation('startPublish')
  const sweepDuePosts = usePikkuMutation('sweepDuePosts')

  const [postId, setPostId] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const posts = drafts.data?.posts ?? []
  const chosen = postId ?? posts[0]?.postId ?? null
  const chosenTitle = posts.find((p) => p.postId === chosen)?.title ?? ''

  const run = async (what: 'due' | 'workflow' | 'sweep') => {
    setFailed(false)
    setDone(null)
    try {
      if (what === 'due') {
        await publishDue.mutateAsync(null)
        setDone(m.ops__publish_due_done())
      } else if (what === 'sweep') {
        await sweepDuePosts.mutateAsync(null)
        setDone(m.ops__done())
      } else if (chosen) {
        await startPublish.mutateAsync({ postId: chosen })
        setDone(m.ops__workflow_done({ title: chosenTitle }))
      }
      await drafts.refetch()
    } catch {
      setFailed(true)
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.ops__title()}
        </Title>
        <Text c="dimmed" size="sm">
          {m.ops__subtitle()}
        </Text>
      </Box>

      {done && (
        <Alert color="teal" variant="light">
          {asI18n(done)}
        </Alert>
      )}
      {failed && (
        <Alert color="red" variant="light">
          {m.ops__failed()}
        </Alert>
      )}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="xs">
          <Title order={2} fz="md" fw={600}>
            {m.ops__publish_due_title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.ops__publish_due_body()}
          </Text>
          <Group>
            <Button loading={publishDue.isPending} onClick={() => void run('due')}>
              {m.ops__publish_due_action()}
            </Button>
            <Button
              variant="default"
              loading={sweepDuePosts.isPending}
              onClick={() => void run('sweep')}
            >
              {m.ops__sweep_due()}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="xs">
          <Title order={2} fz="md" fw={600}>
            {m.ops__workflow_title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.ops__workflow_body()}
          </Text>
          {posts.length === 0 ? (
            <Text c="dimmed" size="sm">
              {m.ops__no_posts()}
            </Text>
          ) : (
            <Group align="flex-end">
              <Select
                data={posts.map((p) => ({ value: p.postId, label: p.title }))}
                value={chosen}
                onChange={setPostId}
                allowDeselect={false}
                w={320}
              />
              <Button
                variant="default"
                loading={startPublish.isPending}
                onClick={() => void run('workflow')}
              >
                {m.ops__workflow_action()}
              </Button>
            </Group>
          )}
        </Stack>
      </Card>
      <LiveFeed />
    </Stack>
  )
}
