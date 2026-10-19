import type { FC } from 'react'
import { Box, Card, Group, Skeleton, Stack, Text, Title } from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { EditorialQueue } from '@/components/EditorialQueue'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso)
  )

/**
 * The reading list.
 *
 * Deliberately sparse: a publication index is scanned, not studied. Title,
 * who wrote it, and how long it will take are the three things a reader uses
 * to decide, and anything else on the card competes with them.
 */
export const JournalPage: FC = () => {
  useLocale()

  const posts = usePikkuQuery('listPublished', { limit: 20 })

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.journal__title()}
        </Title>
        <Text c="dimmed" size="sm">
          {m.journal__subtitle()}
        </Text>
      </Box>

      {/* Renders nothing when there is nothing waiting, so a reader never sees
          an empty editorial box on a site that is fully published. */}
      <EditorialQueue onPublished={() => void posts.refetch()} />

      {posts.isError ? (
        <QueryErrorCard error={posts.error} onRetry={() => void posts.refetch()} />
      ) : posts.isLoading ? (
        <Stack gap="sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={86} radius="md" />
          ))}
        </Stack>
      ) : posts.data?.posts.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.journal__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.journal__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {/* The whole card opens the post. A headline that is not a link is a
              publication you cannot read. The comment sits outside the map
              because a JSX comment cannot be the first expression in a
              parenthesised arrow body. */}
          {posts.data?.posts.map((post) => (
            // The Link wraps the Card rather than being it: Mantine's
            // polymorphic `component` prop drops TanStack's route typing, so
            // `params` stops being checked against the route it belongs to.
            <Link
              key={post.slug}
              to="/app/journal/$slug"
              params={{ slug: post.slug }}
              style={{ textDecoration: 'none' }}
            >
            <Card withBorder radius="md" padding="lg">
              <Stack gap={6}>
                <Text fw={650} fz="lg" lh={1.3}>
                  {asI18n(post.title)}
                </Text>
                {post.excerpt && (
                  <Text c="dimmed" size="sm" lineClamp={2}>
                    {asI18n(post.excerpt)}
                  </Text>
                )}
                <Group gap="xs" mt={4}>
                  <Text size="xs" fw={600}>
                    {asI18n(post.author)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {asI18n(dateLabel(post.publishedAt))}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {m.journal__reading({ minutes: post.readingMinutes })}
                  </Text>
                </Group>
              </Stack>
            </Card>
            </Link>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
