import type { FC } from 'react'
import { Button, Card, Stack, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type Props = {
  /**
   * The error the query failed with. Read for its status, not rendered — a raw
   * server message is rarely something a reader can act on.
   */
  error: unknown
  onRetry: () => void
}

/** 403/401 mean the request was understood and refused; retrying changes nothing. */
const isForbidden = (error: unknown): boolean => {
  const status = (error as { status?: number; statusCode?: number } | null)?.status
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  return status === 403 || status === 401 || statusCode === 403 || statusCode === 401
}

/**
 * What a page shows when its data did not arrive.
 *
 * Without this, a failed query falls through to the loading branch and the page
 * shows skeletons forever — which reads as a slow network rather than a request
 * that already failed, so nobody retries and nobody reports it. A refused
 * request gets no retry button, because offering an action that cannot work is
 * worse than offering none.
 */
export const QueryErrorCard: FC<Props> = ({ error, onRetry }) => {
  useLocale()
  const forbidden = isForbidden(error)

  return (
    <Card withBorder radius="md" p="xl">
      <Stack align="center" gap="xs">
        <Text fw={600}>{m.list_error__title()}</Text>
        <Text c="dimmed" size="sm" ta="center">
          {forbidden ? m.list_error__forbidden() : m.list_error__hint()}
        </Text>
        {!forbidden && (
          <Button variant="default" size="xs" mt="xs" onClick={onRetry}>
            {m.error__retry()}
          </Button>
        )}
      </Stack>
    </Card>
  )
}
