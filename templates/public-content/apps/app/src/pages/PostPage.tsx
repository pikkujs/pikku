import type { FC } from 'react'
import { Anchor, Box, Card, Group, Skeleton, Stack, Text, Title } from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type Props = { slug: string }

/**
 * A post, read.
 *
 * The journal listed excerpts and nothing opened them, so the publication had
 * no reading surface at all — and `recordView`, wired to a queue for exactly
 * this moment, could never fire because the moment did not exist.
 */
export const PostPage: FC<Props> = ({ slug }) => {
  useLocale()
  const post = usePikkuQuery('getPost', { slug })

  if (post.isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton h={40} w="60%" radius="sm" />
        <Skeleton h={16} w="30%" radius="sm" />
        <Skeleton h={200} radius="md" mt="md" />
      </Stack>
    )
  }

  if (post.isError) {
    return (
      <Stack gap="lg">
        <Anchor component={Link} to="/app/journal" size="sm">
          {m.post__back()}
        </Anchor>
        <QueryErrorCard error={post.error} onRetry={() => void post.refetch()} />
      </Stack>
    )
  }

  if (!post.data) {
    return (
      <Card withBorder radius="md" p="xl">
        <Stack align="center" gap={4}>
          <Text fw={600}>{m.post__missing_title()}</Text>
          <Text c="dimmed" size="sm">
            {m.post__missing_hint()}
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="lg" maw={720}>
      <Anchor component={Link} to="/app/journal" size="sm">
        {m.post__back()}
      </Anchor>

      <Box>
        <Title order={1} fz={34} fw={650} style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {asI18n(post.data.title)}
        </Title>
        <Group gap="xs" mt={8}>
          <Text size="sm" fw={600}>
            {m.post__by({ author: post.data.author })}
          </Text>
          <Text size="sm" c="dimmed">
            {m.journal__reading({ minutes: post.data.readingMinutes })}
          </Text>
        </Group>
      </Box>

      {/* `lineBreaks` because the body is prose with paragraph breaks, not
          markup — rendering it without them collapses the piece into one block. */}
      <Text lineBreaks style={{ lineHeight: 1.75 }}>
        {asI18n(post.data.body)}
      </Text>
    </Stack>
  )
}
