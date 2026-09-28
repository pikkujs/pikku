import React, { useMemo, useState } from 'react'
import { Alert, SegmentedControl, Stack, Text } from '@pikku/mantine/core'
import { KeyRound, Link2, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useOptionalAuth } from '../../context/AuthContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useNavigate } from '../../router'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'
import { AppCredentialActions, MyCredentialActions } from './CredentialActions'

const CREDENTIALS_DOCS = 'https://pikku.dev/docs/core-features/credentials'

type Scope = 'app' | 'me' | 'customers'

interface CredentialEntry {
  name: string
  displayName: string
  description?: string
  perUser: boolean
  isOAuth2: boolean
}

interface CredentialOwner {
  packageName: string
  namespace: string
}

interface UserEntry {
  userId: string
  credentials: Record<string, boolean>
}

const matches = (query: string, ...values: (string | undefined)[]) =>
  values.some((value) => value?.toLowerCase().includes(query))

export const CredentialsWorkspace: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const { meta, loading: metaLoading } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const auth = useOptionalAuth()
  const navigate = useNavigate()
  const { openCredentialUser } = usePanelContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [scope, setScope] = useState<Scope>('app')
  const query = searchQuery.trim().toLowerCase()

  const credentials = useMemo(
    (): CredentialEntry[] =>
      Object.entries(((meta as any).credentialsMeta ?? {}) as Record<string, any>)
        .map(([name, data]) => ({
          name,
          displayName: data.displayName || name,
          description: data.description,
          perUser: data.type === 'wire',
          isOAuth2: !!data.oauth2,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [meta]
  )
  const appWide = credentials.filter((c) => !c.perUser)
  const perUser = credentials.filter((c) => c.perUser)
  const mine = perUser.filter((c) => c.isOAuth2)

  const { data: owners } = useQuery({
    queryKey: ['credential-owners'],
    queryFn: async () => {
      const installed = (await rpc.invoke('console:getInstalledAddons')) as Array<{
        packageName: string
        namespace: string
      }>
      const map: Record<string, CredentialOwner> = {}
      await Promise.all(
        (installed ?? []).map(async (addon) => {
          const pkg = (await rpc.invoke('console:getAddonInstalledPackage', {
            packageName: addon.packageName,
          })) as { credentials?: Record<string, unknown> } | null
          for (const credName of Object.keys(pkg?.credentials ?? {})) {
            map[credName] = {
              packageName: addon.packageName,
              namespace: addon.namespace,
            }
          }
        })
      )
      return map
    },
    enabled: credentials.length > 0,
    staleTime: 60 * 1000,
  })

  const { data: appStatus } = useQuery({
    queryKey: ['credential-global-status'],
    queryFn: async () => {
      const result = await rpc.invoke('admin:credentialStatus', {
        names: appWide.map((c) => c.name),
      })
      return (result.statuses ?? {}) as Record<string, boolean>
    },
    enabled: appWide.length > 0,
  })

  const { data: linkedProviders } = useQuery({
    queryKey: ['linked-accounts', auth?.user?.id],
    enabled: !!auth?.user && mine.length > 0,
    queryFn: async () => {
      const { data } = await auth!.client.listAccounts()
      return new Set((data ?? []).map((a: any) => a.providerId as string))
    },
  })

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['credential-list-users'],
    queryFn: async () => {
      const result = await rpc.invoke('admin:credentialListUsers')
      return (result.users ?? []) as UserEntry[]
    },
    enabled: perUser.length > 0,
  })

  const perUserMeta = perUser.map((c) => ({
    name: c.name,
    displayName: c.displayName,
    isOAuth2: c.isOAuth2,
  }))
  const openUser = (user: UserEntry) =>
    openCredentialUser(user.userId, {
      credentials: user.credentials,
      credentialsMeta: perUserMeta,
    })

  usePanelUrl({
    type: 'credentialUser',
    items: users ?? [],
    getId: (user) => user.userId,
    open: (_id, user) => openUser(user),
  })

  const filterCredentials = (list: CredentialEntry[]) =>
    query
      ? list.filter((c) =>
          matches(
            query,
            c.name,
            c.displayName,
            c.description,
            owners?.[c.name]?.namespace
          )
        )
      : list

  const openOwner = (name: string) => {
    const owner = owners?.[name]
    return owner
      ? () =>
          navigate(
            `/addons?id=${encodeURIComponent(owner.packageName)}&source=installed`
          )
      : undefined
  }

  if (!metaLoading && credentials.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={KeyRound}
        hero={emptyHero}
        title={m.credentials_empty_title()}
        description={m.credentials_empty_description()}
        docsHref={CREDENTIALS_DOCS}
      />
    )
  }

  const connected = appWide.filter((c) => appStatus?.[c.name] === true).length
  const missing = appStatus ? appWide.length - connected : 0

  const credentialRow = (
    cred: CredentialEntry,
    isConnected: boolean | undefined,
    actions: React.ReactNode
  ) => (
    <CardRow
      key={cred.name}
      testId={`credential-${cred.name}`}
      leading={
        <StatusTile
          tone={isConnected === undefined ? 'neutral' : isConnected ? 'good' : 'warn'}
        >
          {cred.isOAuth2 ? <Link2 size={18} /> : <KeyRound size={18} />}
        </StatusTile>
      }
      title={asI18n(cred.displayName)}
      badges={
        isConnected === undefined ? undefined : (
          <StatusBadge tone={isConnected ? 'good' : 'warn'} size="sm">
            {isConnected ? m.credentials_connected() : m.credentials_not_connected()}
          </StatusBadge>
        )
      }
      meta={cred.description ? asI18n(cred.description) : m.credentials_no_description()}
      trailing={cred.isOAuth2 ? actions : undefined}
      onClick={openOwner(cred.name)}
    />
  )

  const empty = (text: I18nNode) => (
    <Text size="sm" c="dimmed">
      {text}
    </Text>
  )

  const shownApp = filterCredentials(appWide)
  const shownMine = filterCredentials(mine)
  const shownUsers = (users ?? []).filter((u) => !query || matches(query, u.userId))

  const body =
    scope === 'app' ? (
      shownApp.length === 0 ? (
        empty(query ? m.credentials_no_matches({ query }) : m.credentials_none_app())
      ) : (
        shownApp.map((cred) => {
          const isConnected = appStatus ? appStatus[cred.name] === true : undefined
          return credentialRow(
            cred,
            isConnected,
            <AppCredentialActions name={cred.name} isConnected={isConnected === true} />
          )
        })
      )
    ) : scope === 'me' ? (
      <>
        {!auth?.user && (
          <Alert color="yellow" variant="light">
            {m.credentials_connections_signed_out()}
          </Alert>
        )}
        {shownMine.length === 0
          ? empty(query ? m.credentials_no_matches({ query }) : m.credentials_none_me())
          : shownMine.map((cred) => {
              const isConnected = linkedProviders?.has(cred.name)
              return credentialRow(
                cred,
                isConnected,
                <MyCredentialActions name={cred.name} isConnected={isConnected === true} />
              )
            })}
      </>
    ) : perUser.length === 0 ? (
      empty(m.credentials_none_customers())
    ) : usersLoading ? null : shownUsers.length === 0 ? (
      empty(query ? m.credentials_no_matches({ query }) : m.credentials_no_customers())
    ) : (
      shownUsers.map((user) => {
        const done = perUser.filter((c) => user.credentials[c.name]).length
        const complete = done === perUser.length
        return (
          <CardRow
            key={user.userId}
            testId={`credential-user-${user.userId}`}
            leading={
              <StatusTile tone={complete ? 'good' : 'warn'}>
                <UserRound size={18} />
              </StatusTile>
            }
            title={asI18n(user.userId)}
            badges={
              <StatusBadge tone={complete ? 'good' : 'warn'} size="sm">
                {m.credentials_user_connected({ done, total: perUser.length })}
              </StatusBadge>
            }
            meta={asI18n(
              perUser
                .filter((c) => user.credentials[c.name])
                .map((c) => c.displayName)
                .join(', ') || '—'
            )}
            onClick={() => openUser(user)}
          />
        )
      })
    )

  const count =
    scope === 'app' ? shownApp.length : scope === 'me' ? shownMine.length : shownUsers.length

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.credentials_title()}
          description={m.credentials_page_description()}
          docsHref={CREDENTIALS_DOCS}
          search={{
            placeholder: m.credentials_search(),
            value: searchQuery,
            onChange: setSearchQuery,
            width: 240,
          }}
        />
      }
      emptyPanelMessage={m.credentials_select_user()}
      surface="cards"
    >
      <CardsPage>
        {!metaLoading && !query && (
          <SummaryCard
            testId="credentials-summary"
            title={
              missing > 0
                ? missing === 1
                  ? m.credentials_hero_needs_one()
                  : m.credentials_hero_needs({ count: missing })
                : credentials.length === 1
                  ? m.credentials_hero_title_one()
                  : m.credentials_hero_title({ count: credentials.length })
            }
            blurb={
              missing > 0
                ? m.credentials_hero_body_missing()
                : m.credentials_hero_body()
            }
            facts={[
              {
                label: m.credentials_fact_services(),
                value: asI18n(String(credentials.length)),
              },
              {
                label: m.credentials_fact_connected(),
                value: appStatus
                  ? m.credentials_fact_of({ done: connected, total: appWide.length })
                  : asI18n('—'),
                tone: missing > 0 ? 'warn' : undefined,
              },
              {
                label: m.credentials_fact_app(),
                value: asI18n(String(appWide.length)),
              },
              {
                label: m.credentials_fact_customers(),
                value: asI18n(String(perUser.length)),
              },
            ]}
          />
        )}
        <SectionCard
          testId="credentials-services"
          title={m.credentials_services_title()}
          subtitle={
            scope === 'customers'
              ? count === 1
                ? m.credentials_customers_count_one()
                : m.credentials_customers_count({ count })
              : count === 1
                ? m.credentials_services_count_one()
                : m.credentials_services_count({ count })
          }
          blurb={
            scope === 'app'
              ? m.credentials_services_blurb_app()
              : scope === 'me'
                ? m.credentials_services_blurb_me()
                : m.credentials_services_blurb_customers()
          }
          right={
            <SegmentedControl
              size="sm"
              value={scope}
              onChange={(value) => setScope(value as Scope)}
              data-testid="credentials-scope"
              data={[
                { value: 'app', label: m.credentials_scope_app() },
                { value: 'me', label: m.credentials_scope_me() },
                { value: 'customers', label: m.credentials_scope_customers() },
              ]}
            />
          }
          footer={
            <ForDevelopers
              attached
              hint={m.credentials_dev_hint()}
              testId="credentials-developers"
            >
              <DevTable
                columns={[
                  m.credentials_dev_col_service(),
                  m.credentials_dev_col_key(),
                  m.credentials_dev_col_type(),
                  m.credentials_dev_col_scope(),
                  m.credentials_dev_col_addon(),
                ]}
                rows={credentials.map((cred) => ({
                  key: cred.name,
                  cells: [
                    <Text key="service" size="sm">
                      {asI18n(cred.displayName)}
                    </Text>,
                    <DevMono key="key" value={cred.name} copy />,
                    <Text key="type" size="sm">
                      {cred.isOAuth2
                        ? m.credentials_type_oauth2()
                        : m.credentials_type_api_key()}
                    </Text>,
                    <DevMono key="scope" value={cred.perUser ? 'wire' : 'singleton'} />,
                    <DevMono key="addon" value={owners?.[cred.name]?.namespace ?? '—'} />,
                  ],
                }))}
              />
            </ForDevelopers>
          }
        >
          <Stack gap="xs" mt="md">
            {body}
          </Stack>
        </SectionCard>
      </CardsPage>
    </ResizablePanelLayout>
  )
}
