import { useState, type FC } from 'react'
import {
  Alert, Box, Button, Card, Group, NumberInput, Select, Stack, Text, TextInput, Title,
} from '@pikku/mantine/core'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { LiveFeed } from '@/components/LiveFeed'
import { AgentChat } from '@/components/AgentChat'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')

/**
 * Running the shop, as opposed to shopping in it.
 *
 * `createCategory`, `createItem`, `updateItem`, `dailySalesReport` and
 * `cleanupAbandonedBaskets` were all wired, scoped and unreachable: the app
 * could sell things and could not stock them, and the two scheduled jobs could
 * only be waited for. An admin with no screen is a database with extra steps.
 */
export const AdminPage: FC = () => {
  useLocale()
  const categories = usePikkuQuery('listCategories', null)
  const items = usePikkuQuery('listItems', { limit: 50 })
  const createCategory = usePikkuMutation('createCategory')
  const createItem = usePikkuMutation('createItem')
  const updateItem = usePikkuMutation('updateItem')
  const salesReport = usePikkuMutation('dailySalesReport')
  const sweepBaskets = usePikkuMutation('cleanupAbandonedBaskets')
  // The low-stock pass. It used to be a `setInterval` inside a trigger source,
  // which meant nobody could force it: an item that ran down between ticks was
  // invisible until the next one, and there was no way to check the alert path
  // worked at all. As a scheduled task it can also be run on demand, which is
  // what this button is.
  const sweepStock = usePikkuMutation('sweepLowStock')
  const startExport = usePikkuMutation('startExport')
  const conditionalReport = usePikkuMutation('conditionalReport')

  const [categoryName, setCategoryName] = useState('')
  const [itemName, setItemName] = useState('')
  const [price, setPrice] = useState<number | string>(1200)
  const [stock, setStock] = useState<number | string>(10)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [restockId, setRestockId] = useState<string | null>(null)
  const [restockTo, setRestockTo] = useState<number | string>(10)
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.categoryId, label: c.name }))
  const itemOptions = (items.data?.items ?? []).map((i) => ({ value: i.itemId, label: i.name }))
  const chosenCategory = categoryId ?? categoryOptions[0]?.value ?? null
  const chosenItem = restockId ?? itemOptions[0]?.value ?? null

  const run = async (what: () => Promise<unknown>) => {
    setFailed(false)
    setNote(null)
    try {
      await what()
      setNote(m.admin__done())
      await Promise.all([categories.refetch(), items.refetch()])
    } catch {
      setFailed(true)
    }
  }

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.admin__title()}
        </Title>
        <Text c="dimmed" size="sm">{m.admin__subtitle()}</Text>
      </Box>

      {note && <Alert color="teal" variant="light">{asI18n(note)}</Alert>}
      {failed && <Alert color="red" variant="light">{m.admin__failed()}</Alert>}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.admin__category_title()}</Title>
          <Group align="flex-end">
            <TextInput
              label={m.admin__category_name()}
              value={categoryName}
              onChange={(e) => setCategoryName(e.currentTarget.value)}
              w={280}
            />
            <Button
              loading={createCategory.isPending}
              disabled={!categoryName.trim()}
              onClick={() =>
                void run(async () => {
                  await createCategory.mutateAsync({
                    name: categoryName.trim(),
                    slug: slugify(categoryName),
                  })
                  setCategoryName('')
                })
              }
            >
              {m.admin__category_add()}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.admin__item_title()}</Title>
          <Group align="flex-end" wrap="wrap">
            <TextInput
              label={m.admin__item_name()}
              value={itemName}
              onChange={(e) => setItemName(e.currentTarget.value)}
              w={240}
            />
            <Select
              label={m.admin__item_category()}
              data={categoryOptions}
              value={chosenCategory}
              onChange={setCategoryId}
              allowDeselect={false}
              w={200}
            />
            <NumberInput label={m.admin__item_price()} value={price} onChange={setPrice} w={140} min={1} />
            <NumberInput label={m.admin__item_stock()} value={stock} onChange={setStock} w={120} min={0} />
            <Button
              loading={createItem.isPending}
              disabled={!itemName.trim() || !chosenCategory}
              onClick={() =>
                void run(async () => {
                  await createItem.mutateAsync({
                    categoryId: chosenCategory!,
                    name: itemName.trim(),
                    slug: slugify(itemName),
                    priceCents: Number(price),
                    stock: Number(stock),
                  })
                  setItemName('')
                })
              }
            >
              {m.admin__item_add()}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.admin__restock_title()}</Title>
          <Group align="flex-end">
            <Select
              data={itemOptions}
              value={chosenItem}
              onChange={setRestockId}
              allowDeselect={false}
              w={280}
            />
            <NumberInput value={restockTo} onChange={setRestockTo} w={120} min={0} />
            <Button
              variant="default"
              loading={updateItem.isPending}
              disabled={!chosenItem}
              onClick={() =>
                void run(() =>
                  updateItem.mutateAsync({ itemId: chosenItem!, stock: Number(restockTo) }),
                )
              }
            >
              {m.admin__restock_action()}
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* The ops agent holds listOrders/getOrder/cancelOrder — the same three
          things this page is for, which is why it belongs here rather than on a
          separate screen. It was declared, wired to nothing and had no UI. */}
      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.assistant__ops_title()}</Title>
          <AgentChat agent="ops" />
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.admin__jobs_title()}</Title>
          <Text c="dimmed" size="sm">{m.admin__jobs_body()}</Text>
          <Group>
            <Button
              variant="default"
              loading={salesReport.isPending}
              onClick={() => void run(() => salesReport.mutateAsync(null))}
            >
              {m.admin__report()}
            </Button>
            <Button
              variant="default"
              loading={sweepBaskets.isPending}
              onClick={() => void run(() => sweepBaskets.mutateAsync(null))}
            >
              {m.admin__sweep()}
            </Button>
            <Button
              variant="default"
              loading={sweepStock.isPending}
              onClick={() => void run(() => sweepStock.mutateAsync(null))}
            >
              {m.admin__sweep_stock()}
            </Button>
            <Button
              variant="default"
              loading={startExport.isPending}
              onClick={() => void run(() => startExport.mutateAsync(null))}
            >
              {m.admin__export()}
            </Button>
            <Button
              variant="default"
              loading={conditionalReport.isPending}
              onClick={() => void run(() => conditionalReport.mutateAsync(null))}
            >
              {m.admin__conditional()}
            </Button>
          </Group>
        </Stack>
      </Card>
      <LiveFeed />
    </Stack>
  )
}
