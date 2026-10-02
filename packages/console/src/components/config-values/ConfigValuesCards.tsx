import React, { useMemo } from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { useQueries } from '@tanstack/react-query'
import { ChevronRight, KeyRound, SlidersHorizontal } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ConsoleLoading } from '../ui/ConsoleLoading'

export type ConfigKind = 'secret' | 'variable'

type Item = {
  name: string
  id: string
  displayName?: string
  description?: string
  optional: boolean
  rawData: any
}

type State = 'missing' | 'optional' | 'set' | 'unknown'

const copy = (kind: ConfigKind) =>
  kind === 'secret'
    ? {
        icon: KeyRound,
        heroAllSet: m.config_secrets_hero_all_set,
        heroRequiredSet: m.config_secrets_hero_required_set,
        heroMissing: m.config_secrets_hero_missing,
        heroMissingOne: m.config_secrets_hero_missing_one,
        heroEmpty: m.config_secrets_hero_empty,
        blurb: m.config_secrets_blurb,
      }
    : {
        icon: SlidersHorizontal,
        heroAllSet: m.config_variables_hero_all_set,
        heroRequiredSet: m.config_variables_hero_required_set,
        heroMissing: m.config_variables_hero_missing,
        heroMissingOne: m.config_variables_hero_missing_one,
        heroEmpty: m.config_variables_hero_empty,
        blurb: m.config_variables_blurb,
      }

const Row: React.FC<{
  item: Item
  state: State
  icon: React.ComponentType<{ size?: number }>
  onOpen: () => void
}> = ({ item, state, icon: Icon, onOpen }) => (
  <CardRow
    testId={`config-value-${item.name}`}
    onClick={onOpen}
    leading={
      <StatusTile
        tone={
          state === 'set' ? 'good' : state === 'missing' ? 'bad' : 'neutral'
        }
      >
        <Icon size={18} />
      </StatusTile>
    }
    title={asI18n(item.displayName || item.name)}
    badges={
      state === 'unknown' ? undefined : (
        <StatusBadge
          size="sm"
          tone={
            state === 'set' ? 'good' : state === 'missing' ? 'bad' : 'neutral'
          }
        >
          {state === 'set'
            ? m.config_state_set()
            : state === 'missing'
              ? m.config_state_missing()
              : m.config_state_optional()}
        </StatusBadge>
      )
    }
    meta={item.description ? asI18n(item.description) : undefined}
    trailing={<ChevronRight size={16} />}
  />
)

/** Every secret or variable the app declares, grouped by whether it has a value yet, each opening its editor in the side panel. */
export const ConfigValuesCards: React.FC<{
  kind: ConfigKind
  searchQuery?: string
  emptyHero?: React.ReactNode
}> = ({ kind, searchQuery = '', emptyHero }) => {
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const { openSecret, openVariable } = usePanelContext()
  const rpc = usePikkuRPC()
  const text = copy(kind)

  const items = useMemo<Item[]>(() => {
    const source = (
      kind === 'secret' ? meta.secretsMeta : meta.variablesMeta
    ) as Record<string, any> | undefined
    return Object.entries(source ?? {})
      .map(([name, data]) => ({
        name,
        id: kind === 'secret' ? data.secretId : data.variableId,
        displayName: data.displayName,
        description: data.description,
        optional: !!data.optional,
        rawData: data,
      }))
      .sort((a, b) =>
        (a.displayName || a.name).localeCompare(b.displayName || b.name)
      )
  }, [kind, meta.secretsMeta, meta.variablesMeta])

  const statuses = useQueries({
    queries: items.map((item) => ({
      queryKey: [`${kind}-value`, item.id, 'exists'],
      queryFn: async () =>
        kind === 'secret'
          ? (await rpc.invoke('console:secretHas', { secretId: item.id }))
              .exists
          : (
              await rpc.invoke('pikkuConsoleGetVariable', {
                variableId: item.id,
              })
            ).exists,
    })),
  })

  const stateOf = (index: number): State => {
    const exists = statuses[index]?.data
    if (exists === undefined) return 'unknown'
    if (exists) return 'set'
    return items[index]!.optional ? 'optional' : 'missing'
  }

  const open = (item: Item) =>
    kind === 'secret'
      ? openSecret(item.name, item.rawData)
      : openVariable(item.name, item.rawData)

  usePanelUrl({
    type: kind,
    items,
    getId: (item) => item.name,
    open: (_id, item) => open(item),
  })

  if (loading) return <ConsoleLoading />

  const query = searchQuery.trim().toLowerCase()
  const shown = items
    .map((item, index) => ({ item, state: stateOf(index) }))
    .filter(
      ({ item }) =>
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.displayName?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    )
  const missingCount = items.filter((_, i) => stateOf(i) === 'missing').length
  const setCount = items.filter((_, i) => stateOf(i) === 'set').length
  const groups: { key: State; title: I18nNode; blurb: I18nNode }[] = [
    {
      key: 'missing',
      title: m.config_group_missing_title(),
      blurb: m.config_group_missing_blurb(),
    },
    {
      key: 'optional',
      title: m.config_group_optional_title(),
      blurb: m.config_group_optional_blurb(),
    },
    {
      key: 'set',
      title: m.config_group_set_title(),
      blurb: m.config_group_set_blurb(),
    },
    {
      key: 'unknown',
      title: m.config_group_unknown_title(),
      blurb: m.config_group_unknown_blurb(),
    },
  ]

  if (items.length === 0 && emptyHero) return <>{emptyHero}</>

  return (
    <Box data-testid="data-table">
      <CardsPage maw={880}>
        <SectionCard
          hero
          testId="config-values-hero"
          eyebrow={
            items.length > 0 ? (
              <Group gap={10} mb={4}>
                <StatusBadge tone={missingCount > 0 ? 'bad' : 'good'}>
                  {m.config_hero_count({
                    set: setCount,
                    total: items.length,
                  })}
                </StatusBadge>
              </Group>
            ) : undefined
          }
          title={
            items.length === 0
              ? text.heroEmpty()
              : statuses.some((status) => status.data === undefined)
                ? m.config_group_unknown_title()
                : missingCount > 0
                  ? plural(missingCount, text.heroMissingOne, text.heroMissing)
                  : setCount === items.length
                    ? text.heroAllSet()
                    : text.heroRequiredSet()
          }
          blurb={text.blurb()}
        />
        {groups.map(({ key, title, blurb }) => {
          const rows = shown.filter(({ state }) => state === key)
          if (rows.length === 0) return null
          return (
            <SectionCard
              key={key}
              testId={`config-values-${key}`}
              title={title}
              subtitle={asI18n(String(rows.length))}
              blurb={blurb}
            >
              <Stack gap="xs" mt="md">
                {rows.map(({ item, state }) => (
                  <Row
                    key={item.name}
                    item={item}
                    state={state}
                    icon={text.icon}
                    onOpen={() => open(item)}
                  />
                ))}
              </Stack>
            </SectionCard>
          )
        })}
        {query && shown.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {m.config_nothing_found()}
          </Text>
        )}
      </CardsPage>
    </Box>
  )
}
