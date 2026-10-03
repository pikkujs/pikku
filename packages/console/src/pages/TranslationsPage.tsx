import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Group,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { Check, Languages, Plus } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusTile } from '../components/ui/StatusTile'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { DevField, DevFields } from '../components/ui/DevDetail'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'
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

const isMissing = (value: string | undefined) =>
  value === undefined || value.includes(MISSING_MARKER)

const missingIn = (app: I18nApp, locale: string) => {
  const catalog = app.locales[locale] ?? {}
  return Object.keys(app.locales[app.baseLocale] ?? {}).filter((id) =>
    isMissing(catalog[id])
  ).length
}

const languageName = (code: string, uiLocale: string) => {
  try {
    return (
      new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) ?? code
    )
  } catch {
    return code
  }
}

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi'])
const direction = (code: string) =>
  RTL.has(code.split('-')[0]!) ? 'rtl' : 'ltr'

const CopyRow: React.FC<{
  id: string
  source: string
  value: string | undefined
  dir: 'ltr' | 'rtl'
  onSave: (value: string) => void
}> = ({ id, source, value, dir, onSave }) => {
  const saved = isMissing(value) ? '' : value!
  const [draft, setDraft] = useState(saved)
  useEffect(() => setDraft(saved), [saved])
  return (
    <CardRow
      testId={`i18n-row-${id}`}
      title={asI18n(source)}
      meta={asI18n(id)}
      middle={
        <TextInput
          value={draft}
          dir={dir}
          placeholder={m.i18n_untranslated_placeholder()}
          error={!draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            if (draft !== saved) onSave(draft)
          }}
        />
      }
    />
  )
}

const LanguageRow: React.FC<{
  app: I18nApp
  code: string
  name: string
  selected: boolean
  onOpen: () => void
}> = ({ app, code, name, selected, onOpen }) => {
  const total = Object.keys(app.locales[app.baseLocale] ?? {}).length
  const isBase = code === app.baseLocale
  const missing = isBase ? 0 : missingIn(app, code)
  return (
    <CardRow
      testId={`i18n-language-${code}`}
      selected={selected}
      onClick={isBase ? undefined : onOpen}
      leading={
        <StatusTile tone={missing === 0 ? 'good' : 'warn'}>
          {missing === 0 ? <Check size={18} /> : <Languages size={18} />}
        </StatusTile>
      }
      title={asI18n(name)}
      badges={
        <>
          {isBase && (
            <StatusBadge size="sm" tone="info" dot={false}>
              {m.i18n_base()}
            </StatusBadge>
          )}
          {app.defaultLocale === code && (
            <StatusBadge size="sm" tone="neutral" dot={false}>
              {m.i18n_is_default()}
            </StatusBadge>
          )}
        </>
      }
      meta={
        isBase
          ? m.i18n_base_about()
          : missing === 0
            ? m.i18n_all_translated()
            : plural(missing, m.i18n_to_translate_one, m.i18n_to_translate)
      }
      middle={
        isBase ? undefined : (
          <Progress
            value={total ? ((total - missing) / total) * 100 : 100}
            color={missing === 0 ? 'green' : 'orange'}
            size="sm"
          />
        )
      }
    />
  )
}

const AddLanguage: React.FC<{
  app: I18nApp
  onAdded: (code: string) => void
}> = ({ app, onAdded }) => {
  const [code, setCode] = useState('')
  const add = useAddI18nLocale()
  return (
    <Group gap="xs" mt="md">
      <TextInput
        size="sm"
        w={220}
        placeholder={m.i18n_new_language_placeholder()}
        value={code}
        onChange={(e) => setCode(e.currentTarget.value.trim())}
      />
      <Button
        size="sm"
        variant="default"
        leftSection={<Plus size={14} />}
        disabled={!code || !!app.locales[code]}
        loading={add.isPending}
        onClick={() =>
          add.mutate(
            { app: app.app, locale: code },
            {
              onSuccess: () => {
                onAdded(code)
                setCode('')
              },
            }
          )
        }
      >
        {m.i18n_add_language()}
      </Button>
    </Group>
  )
}

const RemoveLanguage: React.FC<{
  app: I18nApp
  code: string
  name: string
  onRemoved: () => void
}> = ({ app, code, name, onRemoved }) => {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteI18nLocale()
  useEffect(() => setConfirming(false), [code])
  if (!confirming)
    return (
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        onClick={() => setConfirming(true)}
      >
        {m.i18n_remove_language()}
      </Button>
    )
  return (
    <Group gap="xs">
      <Text size="sm">{m.i18n_remove_confirm({ language: name })}</Text>
      <Button
        size="xs"
        color="red"
        loading={remove.isPending}
        onClick={() =>
          remove.mutate(
            { app: app.app, locale: code },
            { onSuccess: onRemoved }
          )
        }
      >
        {m.i18n_remove_yes()}
      </Button>
      <Button size="xs" variant="default" onClick={() => setConfirming(false)}>
        {m.i18n_remove_keep()}
      </Button>
    </Group>
  )
}

const AppCopy: React.FC<{ app: I18nApp; search: string; multi: boolean }> = ({
  app,
  search,
  multi,
}) => {
  const { locale: uiLocale } = useLocale()
  const codes = Object.keys(app.locales).sort((a, b) =>
    a === app.baseLocale ? -1 : b === app.baseLocale ? 1 : a.localeCompare(b)
  )
  const others = codes.filter((c) => c !== app.baseLocale)
  const [code, setCode] = useState<string | null>(
    others.find((c) => missingIn(app, c) > 0) ?? others[0] ?? null
  )
  const [onlyMissing, setOnlyMissing] = useState(false)
  const write = useWriteI18nLocale()
  const setDefault = useSetI18nDefaultLocale()
  const name = (c: string) => languageName(c, uiLocale)

  const base = app.locales[app.baseLocale] ?? {}
  const catalog = (code && app.locales[code]) || {}
  const rows = useMemo(() => {
    const q = search.toLowerCase()
    return Object.keys(base).filter(
      (id) =>
        (!onlyMissing || isMissing(catalog[id])) &&
        (!q ||
          id.toLowerCase().includes(q) ||
          base[id]!.toLowerCase().includes(q) ||
          (catalog[id] ?? '').toLowerCase().includes(q))
    )
  }, [base, catalog, search, onlyMissing])

  return (
    <>
      <SectionCard
        testId={`i18n-app-${app.app}`}
        eyebrow={
          multi ? (
            <Text size="xs" c="dimmed" ff="monospace">
              {asI18n(app.app)}
            </Text>
          ) : undefined
        }
        title={m.i18n_languages_title()}
        blurb={m.i18n_languages_blurb()}
      >
        <Stack gap="xs" mt="md">
          {codes.map((c) => (
            <LanguageRow
              key={c}
              app={app}
              code={c}
              name={name(c)}
              selected={c === code}
              onOpen={() => setCode(c)}
            />
          ))}
        </Stack>
        <AddLanguage app={app} onAdded={setCode} />
      </SectionCard>

      {code && app.locales[code] && (
        <SectionCard
          testId={`i18n-wording-${code}`}
          title={m.i18n_wording_title({ language: name(code) })}
          blurb={m.i18n_wording_blurb({
            language: name(code),
            base: name(app.baseLocale),
          })}
          right={
            <Group gap="sm">
              {app.defaultLocale !== null && app.defaultLocale !== code && (
                <Button
                  size="xs"
                  variant="default"
                  loading={setDefault.isPending}
                  onClick={() =>
                    setDefault.mutate({ app: app.app, locale: code })
                  }
                >
                  {m.i18n_make_default()}
                </Button>
              )}
              <RemoveLanguage
                app={app}
                code={code}
                name={name(code)}
                onRemoved={() => setCode(null)}
              />
            </Group>
          }
        >
          <Group mt="md">
            <Switch
              size="sm"
              label={m.i18n_only_untranslated()}
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.currentTarget.checked)}
            />
          </Group>
          <Stack gap="xs" mt="md">
            {rows.map((id) => (
              <CopyRow
                key={`${code}:${id}`}
                id={id}
                source={base[id]!}
                value={catalog[id]}
                dir={direction(code)}
                onSave={(value) =>
                  write.mutate({
                    app: app.app,
                    locale: code,
                    content: { ...catalog, [id]: value },
                  })
                }
              />
            ))}
            {rows.length === 0 && (
              <Text c="dimmed" ta="center" py="lg">
                {onlyMissing && !search
                  ? m.i18n_all_translated()
                  : m.i18n_nothing_found()}
              </Text>
            )}
          </Stack>
        </SectionCard>
      )}
    </>
  )
}

export const TranslationsPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  const { data: apps, isLoading } = useI18nApps()
  const sync = useSyncI18n()

  const languages = new Set(
    (apps ?? []).flatMap((app) => Object.keys(app.locales))
  )
  const missing = (apps ?? []).reduce(
    (sum, app) =>
      sum +
      Object.keys(app.locales)
        .filter((c) => c !== app.baseLocale)
        .reduce((s, c) => s + missingIn(app, c), 0),
    0
  )

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        surface="cards"
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
        <Box data-testid="translations-page">
          <CardsPage maw={960}>
            {!isLoading && (
              <SectionCard
                hero
                testId="i18n-hero"
                eyebrow={
                  apps?.length ? (
                    <Box mb={4}>
                      <StatusBadge tone={missing > 0 ? 'warn' : 'good'}>
                        {missing > 0
                          ? plural(
                              missing,
                              m.i18n_to_translate_one,
                              m.i18n_to_translate
                            )
                          : m.i18n_all_translated()}
                      </StatusBadge>
                    </Box>
                  ) : undefined
                }
                title={
                  !apps?.length
                    ? m.i18n_hero_none_title()
                    : plural(
                        languages.size,
                        m.i18n_hero_title_one,
                        m.i18n_hero_title
                      )
                }
                blurb={apps?.length ? m.i18n_hero_blurb() : m.i18n_none()}
                footer={
                  apps?.length ? (
                    <ForDevelopers attached testId="i18n-developers">
                      <DevFields>
                        {apps.map((app) => (
                          <DevField
                            key={app.app}
                            label={asI18n(app.app)}
                            value={app.messagesDir}
                          />
                        ))}
                      </DevFields>
                      <Group mt="sm">
                        <Button
                          size="xs"
                          variant="default"
                          loading={sync.isPending}
                          onClick={() => sync.mutate({})}
                        >
                          {m.i18n_fill_missing()}
                        </Button>
                      </Group>
                    </ForDevelopers>
                  ) : undefined
                }
              />
            )}
            {apps?.map((app) => (
              <AppCopy
                key={app.app}
                app={app}
                search={search}
                multi={apps.length > 1}
              />
            ))}
          </CardsPage>
        </Box>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
