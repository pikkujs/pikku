import React, { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { Plus } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'
import {
  MISSING_MARKER,
  useAddI18nLocale,
  useDeleteI18nLocale,
  useI18nApps,
  useSetI18nDefaultLocale,
  useSyncI18n,
  useWriteI18nLocale,
  type I18nApp,
} from '../hooks/useI18n'

const untranslated = (catalog: Record<string, string>) =>
  Object.values(catalog).filter((v) => v.includes(MISSING_MARKER)).length

const CopyRow: React.FC<{
  id: string
  source: string
  value: string
  editable: boolean
  onSave: (value: string) => void
}> = ({ id, source, value, editable, onSave }) => {
  const [draft, setDraft] = useState(value.replace(MISSING_MARKER, ''))
  useEffect(() => setDraft(value.replace(MISSING_MARKER, '')), [value])
  const missing = value.includes(MISSING_MARKER)
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm">{asI18n(source)}</Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {asI18n(id)}
        </Text>
      </Table.Td>
      {editable && (
        <Table.Td w="50%">
          <TextInput
            value={draft}
            error={missing}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={() => {
              if (draft !== value) onSave(draft)
            }}
          />
        </Table.Td>
      )}
    </Table.Tr>
  )
}

const AppCopy: React.FC<{ app: I18nApp; search: string }> = ({
  app,
  search,
}) => {
  const locales = Object.keys(app.locales).sort()
  const [locale, setLocale] = useState(
    locales.find((l) => l !== app.baseLocale) ?? app.baseLocale
  )
  const [newLocale, setNewLocale] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const write = useWriteI18nLocale()
  const add = useAddI18nLocale()
  const remove = useDeleteI18nLocale()
  const setDefault = useSetI18nDefaultLocale()
  const sync = useSyncI18n()

  const base = app.locales[app.baseLocale] ?? {}
  const catalog = app.locales[locale] ?? {}
  const isBase = locale === app.baseLocale
  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return Object.keys(base).filter(
      (id) =>
        (!onlyMissing ||
          (catalog[id] ?? MISSING_MARKER).includes(MISSING_MARKER)) &&
        (!q ||
          id.toLowerCase().includes(q) ||
          base[id]!.toLowerCase().includes(q) ||
          (catalog[id] ?? '').toLowerCase().includes(q))
    )
  }, [base, catalog, search, onlyMissing])

  return (
    <Stack gap="md" data-testid={`i18n-app-${app.app}`}>
      <Group justify="space-between" wrap="wrap">
        <Text fw={600}>{asI18n(app.app)}</Text>
        <Group gap="xs">
          <TextInput
            size="xs"
            placeholder={m.i18n_new_language_placeholder()}
            value={newLocale}
            onChange={(e) => setNewLocale(e.currentTarget.value.trim())}
          />
          <Button
            size="xs"
            leftSection={<Plus size={14} />}
            disabled={!newLocale}
            loading={add.isPending}
            onClick={() =>
              add.mutate(
                { app: app.app, locale: newLocale },
                {
                  onSuccess: () => {
                    setLocale(newLocale)
                    setNewLocale('')
                  },
                }
              )
            }
          >
            {m.i18n_add_language()}
          </Button>
        </Group>
      </Group>
      <Group gap="xs">
        {locales.map((l) => {
          const missing = untranslated(app.locales[l]!)
          return (
            <Button
              key={l}
              size="xs"
              variant={l === locale ? 'filled' : 'default'}
              onClick={() => setLocale(l)}
            >
              {asI18n(l)}
              {l !== app.baseLocale && missing > 0 && (
                <Badge ml={6} size="xs" color="orange">
                  {asI18n(String(missing))}
                </Badge>
              )}
            </Button>
          )
        })}
      </Group>
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          {isBase ? (
            <Badge variant="light">{m.i18n_base()}</Badge>
          ) : untranslated(catalog) ? (
            <Badge color="orange" variant="light">
              {m.i18n_to_translate({ count: untranslated(catalog) })}
            </Badge>
          ) : (
            <Badge color="green" variant="light">
              {m.i18n_all_translated()}
            </Badge>
          )}
          {app.defaultLocale === locale && (
            <Badge variant="outline">{m.i18n_is_default()}</Badge>
          )}
          {!isBase && (
            <Checkbox
              size="xs"
              label={m.i18n_only_untranslated()}
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.currentTarget.checked)}
            />
          )}
        </Group>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            loading={sync.isPending}
            onClick={() => sync.mutate({ app: app.app })}
          >
            {m.i18n_fill_missing()}
          </Button>
          {app.defaultLocale !== null && app.defaultLocale !== locale && (
            <Button
              size="xs"
              variant="default"
              loading={setDefault.isPending}
              onClick={() => setDefault.mutate({ app: app.app, locale })}
            >
              {m.i18n_make_default()}
            </Button>
          )}
          {!isBase && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { app: app.app, locale },
                  { onSuccess: () => setLocale(app.baseLocale) }
                )
              }
            >
              {m.i18n_remove_language()}
            </Button>
          )}
        </Group>
      </Group>
      <Table verticalSpacing="xs">
        <Table.Tbody>
          {rows.map((id) => (
            <CopyRow
              key={`${locale}:${id}`}
              id={id}
              source={base[id]!}
              value={catalog[id] ?? MISSING_MARKER}
              editable={!isBase}
              onSave={(value) =>
                write.mutate({
                  app: app.app,
                  locale,
                  content: { ...catalog, [id]: value },
                })
              }
            />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

export const TranslationsPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  const { data: apps, isLoading } = useI18nApps()

  return (
    <PageContainer
      data-testid="translations-page"
      header={
        <ListPageHeader
          title={m.i18n_page_title()}
          description={m.i18n_page_desc()}
          search={{
            placeholder: m.i18n_search(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
        />
      }
    >
      <CardsPage>
        {!isLoading && !apps?.length && <Text c="dimmed">{m.i18n_none()}</Text>}
        {apps?.map((app) => (
          <AppCopy key={app.app} app={app} search={search} />
        ))}
      </CardsPage>
    </PageContainer>
  )
}
