import { useEffect, useState, type FC } from 'react'
import { Badge, Card, Group, Stack, Text } from '@pikku/mantine/core'
import { m, asI18n } from '@/i18n/messages'
import { apiUrl } from '@/lib/env'
import { useLocale } from '@/i18n/config'

/**
 * The channel, which nothing ever opened.
 *
 * `subscribeToOrder` was wired to a channel with a connect handler, a disconnect handler and
 * an event-hub subscription — the whole realtime surface — and no client ever
 * connected. A websocket with no subscriber is a feature that exists only in
 * the code.
 *
 * A native `WebSocket` rather than the generated `PikkuWebSocket`: that client
 * imports `@pikku/websocket`, which is not a dependency of this template, so it
 * cannot be built against as shipped. Worth fixing upstream; in the meantime
 * the wire protocol is a JSON action and needs no client at all.
 *
 * Renders payloads verbatim. The point of the panel is that the connection is
 * real and events arrive, not that this template knows what each one means.
 */
export const LiveFeed: FC = () => {
  useLocale()
  const [events, setEvents] = useState<string[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const url = `${apiUrl().replace(/^http/, 'ws')}/orders/status`
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      return
    }

    socket.addEventListener('open', () => {
      setConnected(true)
      // `subscribeToOrder` is the action that subscribes this channel to the event hub.
      socket.send(JSON.stringify({ action: 'subscribeToOrder', orderId: '' }))
    })
    socket.addEventListener('message', (event) => {
      setEvents((previous) => [String(event.data), ...previous].slice(0, 8))
    })
    socket.addEventListener('close', () => setConnected(false))
    // Errors are expected when nothing is listening; the badge already says so.
    socket.addEventListener('error', () => setConnected(false))

    return () => {
      // Say goodbye before hanging up. Closing the socket drops the connection,
      // but the event hub keeps the subscription against a channel that is gone
      // until the disconnect handler tidies it — and `unsubscribeFromOrder` was
      // wired for exactly this and called by nothing. Guarded on OPEN because a
      // socket that never connected has nothing to unsubscribe from.
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'unsubscribeFromOrder', orderId: '' }))
      }
      socket.close()
    }
  }, [])

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600}>{m.live__title()}</Text>
          <Badge size="sm" variant="light" color={connected ? 'teal' : 'gray'}>
            {connected ? m.live__subtitle() : m.live__offline()}
          </Badge>
        </Group>
        {events.length === 0 ? (
          <Text c="dimmed" size="sm">
            {connected ? m.live__waiting() : m.live__offline()}
          </Text>
        ) : (
          events.map((event, index) => (
            <Text key={index} size="xs" ff="monospace" c="dimmed" lineClamp={1}>
              {asI18n(event)}
            </Text>
          ))
        )}
      </Stack>
    </Card>
  )
}
