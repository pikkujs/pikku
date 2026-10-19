import { useState, type FC } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { AgentChat } from '@/components/AgentChat'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format(cents / 100)

/**
 * The other half of the catalogue.
 *
 * `addToBasket` wrote into a basket that had no screen, so a shopper could put
 * things in and never see them again — while `getBasket`, `removeFromBasket`
 * and the whole checkout workflow sat wired and unreachable. The address form is here rather
 * than on a separate step because a basket with one item does not deserve a
 * checkout funnel; the whole transaction is one screen and one button.
 */
export const BasketPage: FC = () => {
  useLocale()
  const navigate = useNavigate()

  const basket = usePikkuQuery('getBasket', {})
  const session = usePikkuQuery('getSession', {})
  const removeFromBasket = usePikkuMutation('removeFromBasket')
  // The workflow, not the direct write. `createOrder` records an order;
  // `startCheckout` validates the basket, charges the card, records the order
  // and finalises it — the path this template actually models, and the one
  // whose eight steps had never run outside a unit of code nobody called.
  const startCheckout = usePikkuMutation('startCheckout')

  const [address, setAddress] = useState({
    line1: '12 Fenchurch Row',
    line2: '',
    city: 'London',
    postcode: 'EC3M 5BN',
    country: 'GB',
  })
  const [failed, setFailed] = useState(false)

  const checkout = async () => {
    setFailed(false)
    try {
      await startCheckout.mutateAsync({
        basketId: basket.data!.basketId,
        userId: session.data!.userId,
        shippingAddress: {
          line1: address.line1,
          city: address.city,
          postcode: address.postcode,
          country: address.country,
        },
      })
      // The order is the receipt, so send them to it rather than leaving them
      // on an emptied basket wondering whether anything happened.
      await navigate({ to: '/app/orders', search: { placed: true } })
    } catch {
      setFailed(true)
    }
  }

  const items = basket.data?.items ?? []

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.basket__title()}
        </Title>
        <Text c="dimmed" size="sm">
          {m.basket__subtitle()}
        </Text>
      </Box>

      {basket.isError ? (
        <QueryErrorCard error={basket.error} onRetry={() => void basket.refetch()} />
      ) : basket.isLoading ? (
        <Stack gap="xs">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={64} radius="md" />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.basket__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.basket__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <Stack gap="xs">
            {items.map((line) => (
              <Card key={line.basketItemId} withBorder radius="md" padding="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                  <Stack gap={2}>
                    <Text fw={600} size="sm">
                      {asI18n(line.name)}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {m.basket__each({ price: money(line.priceCents) })}
                    </Text>
                  </Stack>
                  <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                    <Text fw={650}>{asI18n(money(line.lineTotalCents))}</Text>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      loading={removeFromBasket.isPending}
                      onClick={() =>
                        removeFromBasket
                          .mutateAsync({ basketId: basket.data!.basketId, itemId: line.itemId })
                          .then(() => basket.refetch())
                      }
                    >
                      {m.basket__remove()}
                    </Button>
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>

          {/* `checkoutAssistant` reads the basket and delegates product
              questions to the shop assistant. It had no screen, so the one
              agent in the app that knew about checkout could not be asked. */}
          <Card withBorder radius="md" padding="lg">
            <Stack gap="sm">
              <Text fw={600}>{m.assistant__checkout_title()}</Text>
              <AgentChat agent="checkout" />
            </Stack>
          </Card>

          <Card withBorder radius="md" padding="lg">
            <Stack gap="sm">
              <Text fw={600}>{m.basket__where_title()}</Text>
              <TextInput
                label={m.basket__line1()}
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.currentTarget.value })}
              />
              <TextInput
                label={m.basket__line2()}
                value={address.line2}
                onChange={(e) => setAddress({ ...address, line2: e.currentTarget.value })}
              />
              <Group grow>
                <TextInput
                  label={m.basket__city()}
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.currentTarget.value })}
                />
                <TextInput
                  label={m.basket__postcode()}
                  value={address.postcode}
                  onChange={(e) => setAddress({ ...address, postcode: e.currentTarget.value })}
                />
              </Group>

              <Divider my="xs" />

              <Group justify="space-between">
                <Text fw={600}>{m.basket__total()}</Text>
                <Text fw={700} fz="lg">
                  {asI18n(money(basket.data?.totalCents ?? 0))}
                </Text>
              </Group>

              {failed && (
                <Alert color="red" variant="light">
                  {m.basket__checkout_failed()}
                </Alert>
              )}

              <Button
                size="md"
                loading={startCheckout.isPending}
                disabled={items.length === 0}
                onClick={() => void checkout()}
              >
                {startCheckout.isPending ? m.basket__checkout_pending() : m.basket__checkout()}
              </Button>
            </Stack>
          </Card>
        </SimpleGrid>
      )}
    </Stack>
  )
}
