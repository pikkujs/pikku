import { useState, type FC } from 'react'
import { Alert, Badge, Button, Card, Group, Stack, Text } from '@pikku/mantine/core'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { postStatus } from '@/i18n/i18n-enum.gen'
import type { PostStatusKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  scheduled: 'blue',
  published: 'teal',
  archived: 'orange',
}

type Props = {
  onPublished: () => void
}

/**
 * What is not published yet, and the button that publishes it.
 *
 * `listDrafts` and `publishPost` were both wired, scoped `posts:publish`, and
 * unreachable — the journal only ever called `listPublished`, so an editor
 * could read the site and never act on it. Publishing was a thing only a test
 * could do.
 *
 * Separate from the reading list rather than merged into it: the two answer
 * different questions ("what is live" versus "what still needs me"), and the
 * editorial one is empty for most people most of the time, which is the right
 * default for a queue.
 */
export const EditorialQueue: FC<Props> = ({ onPublished }) => {
  useLocale()
  const drafts = usePikkuQuery('listDrafts', { limit: 50 })
  const publishPost = usePikkuMutation('publishPost')
  const [failed, setFailed] = useState(false)

  // Everything the public list already shows is not this list's business.
  const waiting = (drafts.data?.posts ?? []).filter((post) => post.status !== 'published')

  if (drafts.isLoading || waiting.length === 0) {
    return null
  }

  const publish = async (postId: string) => {
    setFailed(false)
    try {
      await publishPost.mutateAsync({ postId })
      await drafts.refetch()
      onPublished()
    } catch {
      setFailed(true)
    }
  }

  return (
    <Stack gap="xs">
      {failed && (
        <Alert color="red" variant="light">
          {m.journal__publish_failed()}
        </Alert>
      )}
      {waiting.map((post) => (
        <Card key={post.postId} withBorder radius="md" padding="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="xs" align="center">
              <Text fw={600} size="sm">
                {asI18n(post.title)}
              </Text>
              <Badge
                size="md"
                variant="light"
                color={STATUS_COLOR[post.status] ?? 'gray'}
                styles={{ label: { color: STATUS_TEXT_COLOR } }}
              >
                {postStatus[post.status as PostStatusKey]?.() ?? asI18n(post.status)}
              </Badge>
            </Group>
            <Button
              size="compact-sm"
              variant="default"
              loading={publishPost.isPending && publishPost.variables?.postId === post.postId}
              onClick={() => void publish(post.postId)}
              style={{ flexShrink: 0 }}
            >
              {m.journal__publish()}
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  )
}
