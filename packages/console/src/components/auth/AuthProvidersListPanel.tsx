import React, { useMemo } from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ChevronRight, KeyRound, Mail } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { useAuthProviders } from '../../hooks/useAuthProviders'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevField, DevFields, DevLinks } from '../ui/DevDetail'
import {
  AUTH_PROVIDERS,
  CREDENTIALS_PROVIDER,
  type AuthProviderDef,
} from './auth-providers-catalog'

export interface AuthProvidersListPanelProps {
  externalSearch?: string
}

const BETTER_AUTH_DOCS = 'https://better-auth.com/docs/concepts/oauth'

export const isCredentials = (provider: AuthProviderDef) =>
  provider.id === CREDENTIALS_PROVIDER.id

export const providerName = (provider: AuthProviderDef): string =>
  isCredentials(provider)
    ? String(m.authproviders_email_name())
    : provider.name

export const providerDescription = (provider: AuthProviderDef): I18nNode =>
  isCredentials(provider)
    ? m.authproviders_email_description()
    : m.authproviders_account_description({ name: provider.name })

export const ProviderIcon: React.FC<{ provider: AuthProviderDef }> = ({
  provider,
}) => (isCredentials(provider) ? <Mail size={18} /> : <KeyRound size={18} />)

const verdictTitle = (names: string[]): I18nNode => {
  if (names.length === 0) return m.authproviders_hero_none_title()
  if (names.length === 1)
    return m.authproviders_hero_title_one({ first: names[0]! })
  if (names.length === 2)
    return m.authproviders_hero_title_two({
      first: names[0]!,
      second: names[1]!,
    })
  return m.authproviders_hero_title_many({ count: names.length })
}

const ProviderRow: React.FC<{
  provider: AuthProviderDef
  on: boolean
  onOpen: () => void
}> = ({ provider, on, onOpen }) => {
  const keys = provider.fields.length
  const meta: I18nNode[] = [providerDescription(provider)]
  if (!on && keys > 0)
    meta.push(
      keys === 1
        ? m.authproviders_keys_one()
        : m.authproviders_keys({ count: keys })
    )
  if (on && isCredentials(provider)) meta.push(m.authproviders_builtin())

  return (
    <CardRow
      testId="auth-provider-row"
      onClick={onOpen}
      leading={
        <StatusTile tone={on ? 'good' : 'neutral'}>
          <ProviderIcon provider={provider} />
        </StatusTile>
      }
      title={asI18n(providerName(provider))}
      badges={
        !on && provider.featured ? (
          <StatusBadge tone="info" size="sm" dot={false}>
            {m.authproviders_popular()}
          </StatusBadge>
        ) : undefined
      }
      meta={meta.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && asI18n(' · ')}
          {part}
        </React.Fragment>
      ))}
      trailing={<ChevronRight size={16} />}
    />
  )
}

export const AuthProvidersListPanel: React.FC<AuthProvidersListPanelProps> = ({
  externalSearch,
}) => {
  const { openAuthProvider } = usePanelContext()
  useLocale()
  const { meta } = useAuthProviders()

  const configuredCallbackIds = useMemo(
    () => new Set(meta.providers.map((p) => p.id)),
    [meta.providers]
  )

  const isOn = (provider: AuthProviderDef): boolean =>
    isCredentials(provider)
      ? meta.hasCredentials
      : configuredCallbackIds.has(provider.callbackId)

  const all = [CREDENTIALS_PROVIDER, ...AUTH_PROVIDERS]
  const query = (externalSearch ?? '').trim().toLowerCase()
  const matches = (provider: AuthProviderDef) =>
    !query ||
    providerName(provider).toLowerCase().includes(query) ||
    provider.name.toLowerCase().includes(query)

  const switchedOn = all.filter(isOn)
  const shownOn = switchedOn.filter(matches)
  const shownOff = all
    .filter((provider) => !isOn(provider) && matches(provider))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))

  const open = (provider: AuthProviderDef) =>
    openAuthProvider(provider.id, { ...provider, name: providerName(provider) })

  return (
    <Box data-testid="data-table">
      <CardsPage maw={880}>
        <SectionCard
          hero
          testId="auth-providers-verdict"
          eyebrow={
            <Group gap={10} mb={4}>
              <StatusBadge tone={switchedOn.length > 0 ? 'good' : 'warn'}>
                {m.authproviders_hero_count({
                  on: switchedOn.length,
                  total: all.length,
                })}
              </StatusBadge>
            </Group>
          }
          title={verdictTitle(
            switchedOn.map((provider) =>
              isCredentials(provider)
                ? String(m.authproviders_email_name_inline())
                : provider.name
            )
          )}
          blurb={
            switchedOn.length > 0
              ? m.authproviders_hero_body()
              : m.authproviders_hero_none_body()
          }
        >
          <Box mt="lg">
            <ForDevelopers
              label={m.authproviders_dev_label()}
              testId="auth-providers-developers"
            >
              <DevFields>
                <DevField
                  label={m.dev_callback_path()}
                  value="/api/auth/callback/<provider>"
                />
                {meta.plugins.length > 0 && (
                  <DevField
                    label={m.authproviders_dev_plugins()}
                    value={meta.plugins.map((plugin) => plugin.id).join(', ')}
                  />
                )}
              </DevFields>
              <DevLinks
                links={[
                  { href: BETTER_AUTH_DOCS, label: m.authproviders_dev_docs() },
                ]}
              />
            </ForDevelopers>
          </Box>
        </SectionCard>

        {shownOn.length > 0 && (
          <SectionCard
            testId="auth-providers-on"
            title={m.authproviders_on_title()}
            blurb={m.authproviders_on_blurb()}
          >
            <Stack gap="xs" mt="md">
              {shownOn.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  on
                  onOpen={() => open(provider)}
                />
              ))}
            </Stack>
          </SectionCard>
        )}

        <SectionCard
          testId="auth-providers-off"
          title={m.authproviders_off_title()}
          blurb={m.authproviders_off_blurb()}
        >
          <Stack gap="xs" mt="md">
            {shownOff.length === 0 && shownOn.length === 0 && (
              <Text size="sm" c="dimmed">
                {m.authproviders_no_match({ query: externalSearch ?? '' })}
              </Text>
            )}
            {shownOff.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                on={false}
                onOpen={() => open(provider)}
              />
            ))}
          </Stack>
        </SectionCard>
      </CardsPage>
    </Box>
  )
}
