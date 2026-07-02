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
} from 'lucide-react'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import type { PackageMeta } from '../../pages/PackagesPage'
import { SurfaceTile } from './SurfaceTile'
import {
  getCategoryMeta,
  addonPrimaryCategory,
  isOfficialAddon,
} from './addonCategoryMeta'

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

interface AddonDetailDrawerProps {
  addon: PackageMeta | null
  installed: boolean
  installing: boolean
  editable: boolean
  onClose: () => void
  onInstall: (addon: PackageMeta) => void
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
  onClose,
  onInstall,
}) => {
  useLocale()
  const rpc = usePikkuRPC()
  const [tab, setTab] = useState<string | null>('overview')

  useEffect(() => {
    if (addon) setTab('overview')
  }, [addon?.id])

  const { data: pkg } = useQuery<CommunityPackage | null>({
    queryKey: ['addon', 'community', addon?.id],
    queryFn: async () =>
      (await rpc.invoke('console:getAddonCommunityPackage', {
        id: addon!.id,
      })) as CommunityPackage | null,
    enabled: !!addon,
  })

  const opened = !!addon
  const official = addon ? isOfficialAddon(addon.name) : false
  const { icon: CategoryIcon, color } = getCategoryMeta(
    addon ? addonPrimaryCategory(addon) : undefined
  )

  const fnRecord = pkg?.functions ?? addon?.functions ?? {}
  const fnNames = Object.keys(fnRecord)
  const surface = [
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
                  {official ? (
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

            <Group gap="sm" mt="lg">
              {installed ? (
                <Button
                  variant="light"
                  color="green"
                  leftSection={<Check size={15} />}
                  disabled
                >
                  {m.packages_added_to_project()}
                </Button>
              ) : (
                editable && (
                  <Button
                    leftSection={<Download size={15} />}
                    loading={installing}
                    onClick={() => onInstall(addon)}
                  >
                    {m.packages_add_to_project()}
                  </Button>
                )
              )}
              <Button
                component="a"
                href="https://pikku.dev/docs/external-packages"
                target="_blank"
                rel="noopener noreferrer"
                variant="default"
                leftSection={<ExternalLink size={15} />}
              >
                {m.packages_docs()}
              </Button>
            </Group>

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
              </Tabs.List>
            </Box>

            <Tabs.Panel value="overview" p="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="sm">
                {m.packages_whats_included()}
              </Text>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
                {surface.map((s) => (
                  <SurfaceTile
                    key={String(s.label)}
                    icon={s.icon}
                    label={s.label}
                    value={s.value}
                  />
                ))}
              </SimpleGrid>

              <Text
                size="xs"
                c="dimmed"
                tt="uppercase"
                fw={700}
                mt="xl"
                mb="sm"
              >
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
                  {official && (
                    <ShieldCheck
                      size={14}
                      color="var(--mantine-color-blue-5)"
                    />
                  )}
                </Group>
              </Group>
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
          </Tabs>
        </Stack>
      )}
    </Drawer>
  )
}
