import React, { useEffect, useState } from 'react'
import {
  Drawer,
  Tabs,
  Group,
  Stack,
  Box,
  Text,
  Title,
  Badge,
  Button,
  Anchor,
  ThemeIcon,
  SimpleGrid,
  Divider,
  Avatar,
  Alert,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Download,
  ShieldCheck,
  ExternalLink,
  FunctionSquare,
  Globe,
  Radio,
  KeyRound,
  Settings2,
  Bot,
  TriangleAlert,
} from 'lucide-react'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import type { PackageMeta } from '../../pages/PackagesPage'
import { SurfaceTile } from './SurfaceTile'
import {
  getCategoryMeta,
  addonPrimaryCategory,
  isOfficialAddon,
} from './addonCategoryMeta'
import { deriveNamespace, isValidNamespace } from './deriveNamespace'

interface CommunityPackage {
  name: string
  displayName: string
  version: string
  description: string
  author?: string
  license?: string
  repository?: string
  icon?: string
  tags?: string[]
  functions?: Record<string, unknown>
  agents?: Record<string, unknown>
  secrets?: Record<string, unknown>
  variables?: Record<string, unknown>
  httpRoutes?: Record<string, Record<string, unknown>>
  channels?: Record<string, unknown>
}

interface OpenApiDetail {
  name: string
  title: string
  description: string
  version: string
  provider: string
  swaggerUrl: string
  totalOperations?: number
}

interface AddonDetailDrawerProps {
  addon: PackageMeta | null
  installed: boolean
  installing: boolean
  editable: boolean
  /** Install/import failure message for this addon, shown inline above the CTA. */
  error?: string | null
  /** 'api' fetches OpenAPI detail instead of a community package and swaps the CTA to Import. */
  kind?: 'addon' | 'api'
  onClose: () => void
  /** `namespace` is the user-chosen wireAddon name (addons only). */
  onInstall: (addon: PackageMeta, namespace?: string) => void
}

const countHttpRoutes = (routes?: CommunityPackage['httpRoutes']) =>
  Object.values(routes ?? {}).reduce(
    (sum, methods) => sum + Object.keys(methods ?? {}).length,
    0
  )

export const AddonDetailDrawer: React.FC<AddonDetailDrawerProps> = ({
  addon,
  installed,
  installing,
  editable,
  error,
  kind = 'addon',
  onClose,
  onInstall,
}) => {
  useLocale()
  const rpc = usePikkuRPC()
  const [tab, setTab] = useState<string | null>('overview')
  const isApi = kind === 'api'

  // The wireAddon name for this install — defaults to the derived slug, editable
  // so the same package can be wired under a distinct name. Reset per addon.
  const [name, setName] = useState('')
  useEffect(() => {
    if (addon) {
      setTab('overview')
      setName(isApi ? '' : deriveNamespace(addon.name))
    }
  }, [addon?.id])

  const nameValid = isApi || isValidNamespace(name)

  const { data: pkg } = useQuery<CommunityPackage | null>({
    queryKey: ['addon', 'community', addon?.id],
    queryFn: async () =>
      (await rpc.invoke('console:getAddonCommunityPackage', {
        id: addon!.id,
      })) as CommunityPackage | null,
    enabled: !isApi && !!addon,
  })

  const { data: apiDetail } = useQuery<OpenApiDetail | null>({
    queryKey: ['api', 'detail', addon?.id],
    queryFn: async () =>
      (await rpc.invoke('console:getOpenapiDetail', {
        name: addon!.name,
      })) as OpenApiDetail | null,
    enabled: isApi && !!addon,
  })

  const opened = !!addon
  const official = !isApi && addon ? isOfficialAddon(addon.name) : false
  const { icon: CategoryIcon, color } = getCategoryMeta(
    addon ? addonPrimaryCategory(addon) : undefined
  )

  const fnRecord = pkg?.functions ?? addon?.functions ?? {}
  const fnNames = Object.keys(fnRecord)
  const secretsRecord = (pkg?.secrets ?? {}) as Record<
    string,
    { displayName?: string; description?: string; secretId?: string } | null
  >
  const variablesRecord = (pkg?.variables ?? {}) as Record<
    string,
    { displayName?: string; description?: string; variableId?: string } | null
  >
  const channelsRecord = pkg?.channels ?? {}
  const httpRouteRows = Object.entries(pkg?.httpRoutes ?? {}).flatMap(
    ([method, routes]) =>
      Object.keys(routes ?? {}).map((route) => ({ method, route }))
  )
  const secretNames = Object.keys(secretsRecord)
  const variableNames = Object.keys(variablesRecord)
  const channelNames = Object.keys(channelsRecord)
  const surface = isApi
    ? [
        {
          icon: Globe,
          label: m.packages_surface_operations(),
          value: apiDetail?.totalOperations ?? addon?.totalOperations ?? 0,
        },
      ]
    : [
        {
          icon: FunctionSquare,
          label: m.packages_surface_functions(),
          value: fnNames.length,
        },
        {
          icon: Globe,
          label: m.packages_surface_http(),
          value: countHttpRoutes(pkg?.httpRoutes),
        },
        {
          icon: Radio,
          label: m.packages_surface_channels(),
          value: Object.keys(pkg?.channels ?? {}).length,
        },
        {
          icon: KeyRound,
          label: m.packages_surface_secrets(),
          value: Object.keys(pkg?.secrets ?? {}).length,
        },
        {
          icon: Settings2,
          label: m.packages_surface_variables(),
          value: Object.keys(pkg?.variables ?? {}).length,
        },
        {
          icon: Bot,
          label: m.packages_surface_agents(),
          value: Object.keys(pkg?.agents ?? addon?.agents ?? {}).length,
        },
      ]

  const displayName = pkg?.displayName ?? addon?.displayName ?? addon?.name
  const description = pkg?.description ?? addon?.description
  const tags = pkg?.tags ?? addon?.tags ?? []
  const author = pkg?.author ?? addon?.author
  const version = pkg?.version ?? addon?.version
  const iconRaw = pkg?.icon ?? addon?.icon
  const iconSrc =
    iconRaw && iconRaw.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconRaw)}`
      : iconRaw
  const docsHref = isApi
    ? (apiDetail?.swaggerUrl ?? addon?.swaggerUrl ?? 'https://pikku.dev/docs/external-packages')
    : 'https://pikku.dev/docs/external-packages'

  const overviewContent = addon && (
    <>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="sm">
        {m.packages_whats_included()}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        {surface.map((s) => (
          <SurfaceTile key={String(s.label)} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </SimpleGrid>

      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="xl" mb="sm">
        {m.packages_published_by()}
      </Text>
      <Group gap="md" wrap="nowrap">
        <Avatar radius="md" color={official ? 'blue' : 'gray'}>
          {(author ?? addon.name).slice(0, 1).toUpperCase()}
        </Avatar>
        <Group gap={6}>
          <Text size="sm" fw={600}>
            {asI18n(author ?? addon.name)}
          </Text>
          {official && <ShieldCheck size={14} color="var(--mantine-color-blue-5)" />}
        </Group>
      </Group>
    </>
  )

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={620}
      title={
        addon ? (
          <Group gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed" ff="monospace">
              {m.packages_community()}
            </Text>
            <Text size="sm" c="dimmed">
              {asI18n('/')}
            </Text>
            <Text size="sm" ff="monospace" fw={500}>
              {asI18n(addon.name)}
            </Text>
          </Group>
        ) : undefined
      }
      styles={{ body: { padding: 0 } }}
    >
      {addon && (
        <Stack gap={0}>
          <Box p="lg">
            <Group gap="md" wrap="nowrap" align="flex-start">
              {iconSrc ? (
                <img
                  src={iconSrc}
                  width={56}
                  height={56}
                  alt={addon.displayName}
                  style={{ objectFit: 'contain', borderRadius: 12 }}
                />
              ) : (
                <ThemeIcon size={56} radius="md" variant="light" color={color}>
                  <CategoryIcon size={28} />
                </ThemeIcon>
              )}
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" align="center">
                  <Title order={3} fw={700}>
                    {asI18n(displayName || addon.name)}
                  </Title>
                  {isApi ? (
                    author && (
                      <Badge size="sm" variant="light" color="gray" tt="none">
                        {asI18n(author)}
                      </Badge>
                    )
                  ) : official ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      leftSection={<ShieldCheck size={11} />}
                    >
                      {m.packages_official()}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="light" color="gray">
                      {m.packages_community()}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" ff="monospace">
                  {asI18n(addon.name)}
                </Text>
              </Stack>
            </Group>

            {description && (
              <Text size="sm" c="dimmed" mt="md">
                {asI18n(description)}
              </Text>
            )}

            {tags.length > 0 && (
              <Group gap={6} mt="sm">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    size="sm"
                    variant="light"
                    color="gray"
                    tt="none"
                    ff="monospace"
                    fw={400}
                  >
                    {asI18n(tag)}
                  </Badge>
                ))}
              </Group>
            )}

            {!installed && !isApi && editable && (
              <TextInput
                mt="lg"
                label={m.packages_install_name_label()}
                description={m.packages_install_name_description()}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={
                  name.length > 0 && !nameValid
                    ? m.packages_install_name_invalid()
                    : null
                }
                styles={{ input: { fontFamily: 'monospace' } }}
              />
            )}

            <Group gap="sm" mt={!installed && !isApi && editable ? 'sm' : 'lg'}>
              {installed ? (
                <Button
                  variant="light"
                  color="green"
                  leftSection={<Check size={15} />}
                  disabled
                >
                  {isApi ? m.packages_imported_to_project() : m.packages_added_to_project()}
                </Button>
              ) : (
                editable && (
                  <Button
                    leftSection={<Download size={15} />}
                    loading={installing}
                    disabled={!nameValid}
                    onClick={() => onInstall(addon, isApi ? undefined : name)}
                  >
                    {isApi ? m.packages_import_to_project() : m.packages_add_to_project()}
                  </Button>
                )
              )}
              <Button
                component="a"
                href={docsHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="default"
                leftSection={<ExternalLink size={15} />}
              >
                {m.packages_docs()}
              </Button>
            </Group>

            {error && (
              <Alert
                mt="sm"
                color="red"
                variant="light"
                icon={<TriangleAlert size={15} />}
              >
                <Text size="sm">
                  {isApi
                    ? m.packages_import_error({ name: addon.displayName || addon.name, message: error })
                    : m.packages_install_error({ name: addon.displayName || addon.name, message: error })}
                </Text>
              </Alert>
            )}

            <Divider my="md" />

            <Group gap="xl">
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {m.packages_meta_version()}
                </Text>
                <Text size="sm" ff="monospace">
                  {asI18n(version ?? '—')}
                </Text>
              </Stack>
              {pkg?.license && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {m.packages_meta_license()}
                  </Text>
                  <Text size="sm">{asI18n(pkg.license)}</Text>
                </Stack>
              )}
              {author && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {m.packages_meta_author()}
                  </Text>
                  <Text size="sm">{asI18n(author)}</Text>
                </Stack>
              )}
            </Group>
          </Box>

          {isApi ? (
            <Box
              p="lg"
              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
            >
              {overviewContent}
            </Box>
          ) : (
          <Tabs value={tab} onChange={setTab}>
            <Box
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
                borderTop: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Tabs.List
                style={{
                  borderBottom: 'none',
                  paddingLeft: 'var(--mantine-spacing-md)',
                }}
              >
                <Tabs.Tab value="overview">
                  {m.packages_tab_overview()}
                </Tabs.Tab>
                <Tabs.Tab value="functions">
                  {asI18n(`${m.packages_tab_functions()} (${fnNames.length})`)}
                </Tabs.Tab>
                {httpRouteRows.length > 0 && (
                  <Tabs.Tab value="http">
                    {asI18n(
                      `${m.packages_surface_http()} (${httpRouteRows.length})`
                    )}
                  </Tabs.Tab>
                )}
                {channelNames.length > 0 && (
                  <Tabs.Tab value="channels">
                    {asI18n(
                      `${m.packages_surface_channels()} (${channelNames.length})`
                    )}
                  </Tabs.Tab>
                )}
                {secretNames.length > 0 && (
                  <Tabs.Tab value="secrets">
                    {asI18n(
                      `${m.packages_surface_secrets()} (${secretNames.length})`
                    )}
                  </Tabs.Tab>
                )}
                {variableNames.length > 0 && (
                  <Tabs.Tab value="variables">
                    {asI18n(
                      `${m.packages_surface_variables()} (${variableNames.length})`
                    )}
                  </Tabs.Tab>
                )}
              </Tabs.List>
            </Box>

            <Tabs.Panel value="overview" p="lg">
              {overviewContent}
            </Tabs.Panel>

            <Tabs.Panel value="functions" p="lg">
              {fnNames.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {m.packages_no_functions()}
                </Text>
              ) : (
                <Stack
                  gap={0}
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 'var(--mantine-radius-md)',
                    overflow: 'hidden',
                  }}
                >
                  {fnNames.map((name, i) => {
                    const fn = fnRecord[name] as {
                      title?: string
                      description?: string
                      category?: string
                    } | null
                    return (
                      <Group
                        key={name}
                        justify="space-between"
                        px="md"
                        py="xs"
                        wrap="nowrap"
                        style={{
                          borderTop:
                            i === 0
                              ? undefined
                              : '1px solid var(--mantine-color-default-border)',
                        }}
                      >
                        <div>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              {asI18n(fn?.title ?? name)}
                            </Text>
                            {fn?.title && (
                              <Text size="xs" c="dimmed" ff="monospace">
                                {asI18n(name)}
                              </Text>
                            )}
                          </Group>
                          {fn?.description && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {asI18n(fn.description)}
                            </Text>
                          )}
                        </div>
                        {fn?.category && (
                          <Badge size="sm" variant="light" color="gray">
                            {asI18n(fn.category)}
                          </Badge>
                        )}
                      </Group>
                    )
                  })}
                </Stack>
              )}
            </Tabs.Panel>

            {httpRouteRows.length > 0 && (
              <Tabs.Panel value="http" p="lg">
                <BorderedList>
                  {httpRouteRows.map(({ method, route }, i) => (
                    <ListRow key={`${method} ${route}`} first={i === 0}>
                      <Group gap="sm" wrap="nowrap">
                        <Badge
                          size="sm"
                          variant="light"
                          color="blue"
                          w={64}
                          ta="center"
                        >
                          {asI18n(method.toUpperCase())}
                        </Badge>
                        <Text size="sm" ff="monospace">
                          {asI18n(route)}
                        </Text>
                      </Group>
                    </ListRow>
                  ))}
                </BorderedList>
              </Tabs.Panel>
            )}

            {channelNames.length > 0 && (
              <Tabs.Panel value="channels" p="lg">
                <BorderedList>
                  {channelNames.map((name, i) => (
                    <ListRow key={name} first={i === 0}>
                      <Text size="sm" fw={500} ff="monospace">
                        {asI18n(name)}
                      </Text>
                    </ListRow>
                  ))}
                </BorderedList>
              </Tabs.Panel>
            )}

            {secretNames.length > 0 && (
              <Tabs.Panel value="secrets" p="lg">
                <BorderedList>
                  {secretNames.map((name, i) => {
                    const secret = secretsRecord[name]
                    return (
                      <ListRow key={name} first={i === 0}>
                        <div>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              {asI18n(secret?.displayName ?? name)}
                            </Text>
                            {secret?.secretId && (
                              <Text size="xs" c="dimmed" ff="monospace">
                                {asI18n(secret.secretId)}
                              </Text>
                            )}
                          </Group>
                          {secret?.description && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {asI18n(secret.description)}
                            </Text>
                          )}
                        </div>
                      </ListRow>
                    )
                  })}
                </BorderedList>
              </Tabs.Panel>
            )}

            {variableNames.length > 0 && (
              <Tabs.Panel value="variables" p="lg">
                <BorderedList>
                  {variableNames.map((name, i) => {
                    const variable = variablesRecord[name]
                    return (
                      <ListRow key={name} first={i === 0}>
                        <div>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={500}>
                              {asI18n(variable?.displayName ?? name)}
                            </Text>
                            {variable?.variableId && (
                              <Text size="xs" c="dimmed" ff="monospace">
                                {asI18n(variable.variableId)}
                              </Text>
                            )}
                          </Group>
                          {variable?.description && (
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              {asI18n(variable.description)}
                            </Text>
                          )}
                        </div>
                      </ListRow>
                    )
                  })}
                </BorderedList>
              </Tabs.Panel>
            )}
          </Tabs>
          )}
        </Stack>
      )}
    </Drawer>
  )
}

const BorderedList: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Stack
    gap={0}
    style={{
      border: '1px solid var(--mantine-color-default-border)',
      borderRadius: 'var(--mantine-radius-md)',
      overflow: 'hidden',
    }}
  >
    {children}
  </Stack>
)

const ListRow: React.FC<{ first: boolean; children: React.ReactNode }> = ({
  first,
  children,
}) => (
  <Group
    justify="space-between"
    px="md"
    py="xs"
    wrap="nowrap"
    style={{
      borderTop: first ? undefined : '1px solid var(--mantine-color-default-border)',
    }}
  >
    {children}
  </Group>
)
