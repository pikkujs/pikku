import { useState, type FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format(
    cents / 100
  )

/**
 * `flexShrink: 0` is load-bearing. These badges sit in a `wrap="nowrap"` Group
 * beside the item name, where both children are shrinkable by default — so the
 * badge lost the fight and rendered as "IN ST…", "SOLD…", "5 L…". The name can
 * wrap onto a second line; a clipped stock label just stops meaning anything.
 */
const NO_SHRINK = { flexShrink: 0 } as const

/**
 * Stock is shown as a state rather than a number until it is nearly gone.
 *
 * "12 left" on a shelf of 200 is noise; "2 left" is the only stock figure a
 * shopper acts on. Showing the count only when it is low means the number
 * carries information every time it appears.
 */
/** Same light-variant contrast shortfall as the other templates' status pills. */
const stockBadge = (stock: number) => {
  const readable = { label: { color: STATUS_TEXT_COLOR } }
  if (stock === 0)
    return (
      <Badge color="gray" variant="light" style={NO_SHRINK} styles={readable}>
        {m.catalogue__sold_out()}
      </Badge>
    )
  if (stock <= 5)
    return (
      <Badge color="orange" variant="light" style={NO_SHRINK} styles={readable}>
        {m.catalogue__low_stock({ count: stock })}
      </Badge>
    )
  return (
    <Badge color="teal" variant="light" style={NO_SHRINK} styles={readable}>
      {m.catalogue__in_stock()}
    </Badge>
  )
}

export const CataloguePage: FC = () => {
  useLocale()
  const [search, setSearch] = useState('')

  const catalogue = usePikkuQuery('listItems', { search: search || undefined, limit: 24 })
  // The basket is fetched rather than assumed: it exists before sign-in, so the
  // id comes from the server rather than being derived from a session here.
  const basket = usePikkuQuery('getBasket', {})
  const addToBasket = usePikkuMutation('addToBasket')

  const [added, setAdded] = useState<string | null>(null)

  // A mutation rather than the RPC hook: `usePikkuRPC` is re-exported by
  // @pikku/react but not by the generated api.gen, so a one-off call still
  // goes through the generated surface.
  const checkAvailability = usePikkuMutation('checkItemAvailability')

  const add = useMutation({
    // Check stock at the moment of the click, not at the moment the page
    // rendered. A catalogue can be minutes old, and telling somebody "added"
    // for an item that has just gone is a lie they discover at checkout.
    mutationFn: async (itemId: string) => {
      const availability = await checkAvailability.mutateAsync({ itemId })
      if (!availability.available) {
        await catalogue.refetch()
        throw new Error('gone')
      }
      return addToBasket.mutateAsync({
        basketId: basket.data!.basketId,
        itemId,
        quantity: 1,
      })
    },
    onSuccess: (_result, itemId) => {
      setAdded(itemId)
      // Confirm in place rather than with a toast: the shopper's eyes are on
      // the card they just clicked, not the corner of the screen.
      setTimeout(() => setAdded((current) => (current === itemId ? null : current)), 1600)
    },
  })

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.catalogue__title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.catalogue__subtitle()}
          </Text>
        </Box>
        <TextInput
          placeholder={m.catalogue__search_placeholder()}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
          aria-label={m.catalogue__search_label()}
        />
      </Group>

      {catalogue.isError ? (
        <QueryErrorCard error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      ) : catalogue.isLoading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} h={190} radius="md" />
          ))}
        </SimpleGrid>
      ) : catalogue.data?.items.length === 0 ? (
        // Two different nothings. "Nothing matches that search" in front of an
        // empty search box blames the reader for a catalogue that is simply
        // empty, and hides the one fact they need — there is nothing to find yet.
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>
              {search ? m.catalogue__empty_title() : m.catalogue__empty_all_title()}
            </Text>
            <Text c="dimmed" size="sm">
              {search ? m.catalogue__empty_hint() : m.catalogue__empty_all_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {catalogue.data?.items.map((item) => (
            <Card key={item.itemId} withBorder radius="md" padding="lg">
              <Stack gap="xs" h="100%" justify="space-between">
                <Stack gap={6}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={600} lh={1.25}>
                      {asI18n(item.name)}
                    </Text>
                    {stockBadge(item.stock)}
                  </Group>
                  <Text c="dimmed" size="xs" tt="uppercase" fw={600} lts="0.04em">
                    {asI18n(item.category.name)}
                  </Text>
                </Stack>

                <Group justify="space-between" align="center" mt="sm">
                  <Text fw={650} fz="lg">
                    {asI18n(money(item.priceCents))}
                  </Text>
                  <Button
                    size="xs"
                    variant={added === item.itemId ? 'light' : 'filled'}
                    color={added === item.itemId ? 'teal' : undefined}
                    disabled={item.stock === 0 || !basket.data}
                    loading={add.isPending && add.variables === item.itemId}
                    onClick={() => add.mutate(item.itemId)}
                  >
                    {added === item.itemId ? m.catalogue__added() : m.catalogue__add()}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}
