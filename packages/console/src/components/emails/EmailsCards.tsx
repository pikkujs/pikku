import React, { useMemo, useState } from 'react'
import {
  ActionIcon,
  Box,
  Button,
  Code,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  Mail,
  MailCheck,
  Inbox,
  UserPlus,
  Link2,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { EmailsCompose } from '../../hooks/useEmailsCompose'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevCode,
  DevField,
  DevFields,
  DevNote,
  devSourcePath,
} from '../ui/DevDetail'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { EmailSourceEditor } from './EmailSourceEditor'

type Copy = {
  name: () => I18nNode
  when: () => I18nNode
  who: () => I18nNode
  Icon: typeof Mail
  account: boolean
}

const KNOWN: Record<string, Copy> = {
  'confirm-email': {
    name: m.emails_name_confirm,
    when: m.emails_when_confirm,
    who: m.emails_who_confirm,
    Icon: MailCheck,
    account: true,
  },
  'magic-link': {
    name: m.emails_name_magic,
    when: m.emails_when_magic,
    who: m.emails_who_magic,
    Icon: Link2,
    account: true,
  },
  'reset-password': {
    name: m.emails_name_reset,
    when: m.emails_when_reset,
    who: m.emails_who_reset,
    Icon: KeyRound,
    account: true,
  },
  invite: {
    name: m.emails_name_invite,
    when: m.emails_when_invite,
    who: m.emails_who_invite,
    Icon: UserPlus,
    account: true,
  },
  'enquiry-received': {
    name: m.emails_name_enquiry,
    when: m.emails_when_enquiry,
    who: m.emails_who_enquiry,
    Icon: Inbox,
    account: false,
  },
}
KNOWN['verify-email'] = KNOWN['confirm-email']!
KNOWN['forgot-password'] = KNOWN['reset-password']!

const humanize = (name: string) => {
  const spaced = name.replace(/[-_]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const copyOf = (name: string): Copy =>
  KNOWN[name] ?? {
    name: () => asI18n(humanize(name)),
    when: m.emails_when_other,
    who: m.emails_who_other,
    Icon: Mail,
    account: false,
  }

const useLanguageName = () => {
  const { locale } = useLocale()
  return useMemo(() => {
    let names: Intl.DisplayNames | undefined
    try {
      names = new Intl.DisplayNames([locale], { type: 'language' })
    } catch {
      names = undefined
    }
    return (code: string) => names?.of(code) ?? code
  }, [locale])
}

const localesOf = (template: EmailsCompose['templates'][string] | undefined) =>
  Object.keys(template?.locales ?? {}).sort((a, b) => a.localeCompare(b))

const listOf = (items: string[], locale: string) => {
  try {
    return new Intl.ListFormat([locale], { type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

const words = (variable: string) =>
  variable
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()

const EmailRow: React.FC<{
  name: string
  languages: string[]
  onOpen: () => void
}> = ({ name, languages, onOpen }) => {
  const copy = copyOf(name)
  return (
    <CardRow
      testId={`email-row-${name}`}
      onClick={onOpen}
      leading={
        <StatusTile tone="info">
          <copy.Icon size={18} />
        </StatusTile>
      }
      title={copy.name()}
      badges={languages.map((language) => (
        <StatusBadge key={language} tone="neutral" size="sm">
          {asI18n(language)}
        </StatusBadge>
      ))}
      meta={
        <Stack gap={2}>
          <span>{copy.when()}</span>
          <span>{copy.who()}</span>
        </Stack>
      }
      trailing={
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={m.emails_open({ name: humanize(name) })}
          onClick={onOpen}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    />
  )
}

export const EmailsOverviewCards: React.FC<{
  compose: EmailsCompose
  src?: string
  searchQuery: string
}> = ({ compose, src, searchQuery }) => {
  const { locale } = useLocale()
  const languageName = useLanguageName()
  const { templates, templateNames } = compose

  const allLanguages = useMemo(
    () =>
      [...new Set(templateNames.flatMap((name) => localesOf(templates[name])))]
        .sort((a, b) => a.localeCompare(b)),
    [templateNames, templates]
  )

  const query = searchQuery.trim().toLowerCase()
  const shown = templateNames.filter((name) => {
    if (!query) return true
    const copy = copyOf(name)
    return [name, String(copy.name()), String(copy.when()), String(copy.who())]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
  const account = shown.filter((name) => copyOf(name).account)
  const other = shown.filter((name) => !copyOf(name).account)

  const rows = (names: string[]) => (
    <Stack gap="xs" mt="md">
      {names.map((name) => (
        <EmailRow
          key={name}
          name={name}
          languages={
            localesOf(templates[name]).length === allLanguages.length
              ? []
              : localesOf(templates[name]).map(languageName)
          }
          onOpen={() => compose.selectTemplate(name)}
        />
      ))}
    </Stack>
  )

  return (
    <>
      <SectionCard
        hero
        testId="emails-hero"
        title={m.emails_cards_title()}
        blurb={
          templateNames.length === 1
            ? m.emails_cards_blurb_one()
            : m.emails_cards_blurb({ count: templateNames.length })
        }
      >
        {allLanguages.length > 0 && (
          <Group gap={8} mt="md">
            <Text size="sm" c="dimmed">
              {m.emails_cards_languages()}
            </Text>
            {allLanguages.map((language) => (
              <StatusBadge key={language} tone="neutral" size="sm">
                {asI18n(languageName(language))}
              </StatusBadge>
            ))}
          </Group>
        )}
      </SectionCard>

      {shown.length === 0 && (
        <SectionCard title={m.emails_no_match()} testId="emails-no-match" />
      )}

      {account.length > 0 && (
        <SectionCard
          testId="emails-group-accounts"
          title={m.emails_group_accounts()}
          blurb={m.emails_group_accounts_blurb()}
        >
          {rows(account)}
        </SectionCard>
      )}

      {other.length > 0 && (
        <SectionCard
          testId="emails-group-other"
          title={m.emails_group_other()}
          blurb={m.emails_group_other_blurb()}
        >
          {rows(other)}
        </SectionCard>
      )}

      <ForDevelopers testId="emails-developers" hint={m.emails_dev_hint()}>
        <DevFields>
          {src && (
            <DevField label={m.emails_dev_folder()} value={devSourcePath(src)} />
          )}
          <DevField
            label={m.emails_dev_templates()}
            value={templateNames.join(', ')}
          />
          <DevField
            label={m.emails_dev_locales()}
            value={listOf(allLanguages, locale)}
          />
        </DevFields>
        <DevCode
          label={m.emails_dev_generate()}
          code="pikku emails generate"
        />
        <DevNote>{m.emails_dev_sending()}</DevNote>
      </ForDevelopers>
    </>
  )
}

type View = 'desktop' | 'phone' | 'text'

type EmailPreview = {
  html?: string
  text?: string
  subject?: string
  source?: string
  missing?: string[]
}

const EmailFrame: React.FC<{ html: string; view: 'desktop' | 'phone' }> = ({
  html,
  view,
}) => {
  const [height, setHeight] = useState(560)
  return (
    <Paper
      variant="inset"
      radius={view === 'phone' ? 24 : 'md'}
      w="100%"
      maw={view === 'phone' ? 390 : 960}
      mx="auto"
      style={{ overflow: 'hidden' }}
    >
      <iframe
        key={`${view}${html.length}`}
        title={view === 'phone' ? 'Phone email preview' : 'Email preview'}
        srcDoc={html}
        data-testid="emails-preview-frame"
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument
          if (doc) setHeight(Math.max(320, doc.documentElement.scrollHeight))
        }}
        style={{ display: 'block', width: '100%', height, border: 0 }}
      />
    </Paper>
  )
}

const Fact: React.FC<{ label: I18nNode; children: I18nNode }> = ({
  label,
  children,
}) => (
  <Stack gap={4} miw={0}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Text>
  </Stack>
)

export const EmailDetailCards: React.FC<{
  compose: EmailsCompose
  src?: string
  onBack: () => void
}> = ({ compose, src, onBack }) => {
  const { locale } = useLocale()
  const languageName = useLanguageName()
  const [view, setView] = useState<View>('desktop')
  const { selectedTemplate, selectedMeta, selectedLocale, preview } = compose
  if (!selectedTemplate || !selectedMeta || !selectedLocale) return null

  const copy = copyOf(selectedTemplate)
  const languages = localesOf(selectedMeta)
  const variables = selectedMeta.variables ?? []
  const data = preview.data as EmailPreview | undefined
  const folder = src ? `${devSourcePath(src)}/` : ''

  return (
    <>
      <SectionCard
        hero
        testId="emails-detail-hero"
        eyebrow={
          <Box mb={4}>
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<ArrowLeft size={14} />}
              onClick={onBack}
              data-testid="emails-back"
              px={4}
            >
              {m.emails_back()}
            </Button>
          </Box>
        }
        title={copy.name()}
        blurb={copy.when()}
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt="lg">
          {data?.subject && (
            <Fact label={m.emails_fact_subject()}>{asI18n(data.subject)}</Fact>
          )}
          <Fact label={m.emails_fact_who()}>{copy.who()}</Fact>
          <Fact label={m.emails_fact_personal()}>
            {variables.length
              ? asI18n(listOf(variables.map(words), locale))
              : m.emails_fact_personal_none()}
          </Fact>
        </SimpleGrid>
      </SectionCard>

      <SectionCard
        testId="emails-preview"
        title={m.emails_preview_title()}
        blurb={m.emails_preview_blurb()}
      >
        <Group gap="sm" mt="md" wrap="wrap">
          {languages.length > 1 && (
            <SegmentedControl
              aria-label={m.emails_language_label()}
              data-testid="emails-language"
              value={selectedLocale}
              onChange={compose.selectLocale}
              data={languages.map((language) => ({
                value: language,
                label: languageName(language),
              }))}
            />
          )}
          <SegmentedControl
            aria-label={m.emails_view_label()}
            data-testid="emails-view"
            value={view}
            onChange={(value) => setView(value as View)}
            data={[
              { value: 'desktop', label: String(m.emails_view_desktop()) },
              { value: 'phone', label: String(m.emails_view_phone()) },
              { value: 'text', label: String(m.emails_view_text()) },
            ]}
          />
        </Group>
        <Box mt="md" miw={0}>
          {preview.isLoading ? (
            <ConsoleLoading py="xl" />
          ) : preview.error ? (
            <Text size="sm" c="dimmed">
              {m.emails_preview_failed()}
            </Text>
          ) : view === 'text' ? (
            data?.text ? (
              <Paper variant="inset" p="md">
                <Text
                  size="sm"
                  component="pre"
                  m={0}
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {asI18n(data.text)}
                </Text>
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">
                {m.emails_no_text_version()}
              </Text>
            )
          ) : (
            <EmailFrame html={data?.html ?? ''} view={view} />
          )}
        </Box>
      </SectionCard>

      <ForDevelopers testId="emails-detail-developers" hint={m.emails_dev_hint()}>
        <DevFields>
          <DevField label={m.dev_id()} value={selectedTemplate} />
          <DevField label={m.emails_dev_locale()} value={selectedLocale} />
          <DevField label={m.emails_dev_files()}>
            <Stack gap={2}>
              {['html', 'subject.txt', 'text.txt'].map((ext) => (
                <Text
                  key={ext}
                  size="sm"
                  ff="monospace"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {asI18n(`${folder}templates/${selectedTemplate}.${ext}`)}
                </Text>
              ))}
            </Stack>
          </DevField>
          <DevField
            label={m.emails_dev_variables()}
            value={variables.join(', ') || '—'}
          />
        </DevFields>
        {data?.missing?.length ? (
          <DevNote>
            {m.emails_dev_missing({ files: data.missing.join(', ') })}
          </DevNote>
        ) : null}
        {preview.error ? (
          <DevNote>
            {asI18n(
              preview.error instanceof Error
                ? preview.error.message
                : String(preview.error)
            )}
          </DevNote>
        ) : null}
        <DevNote>{m.emails_dev_sending()}</DevNote>
        <Stack gap={6}>
          <Text size="sm" c="dimmed">
            {m.emails_dev_source()}
          </Text>
          {data?.source ? (
            <EmailSourceEditor
              templateName={selectedTemplate}
              source={data.source}
            />
          ) : (
            <Code>templates/{selectedTemplate}.html</Code>
          )}
        </Stack>
      </ForDevelopers>
    </>
  )
}
