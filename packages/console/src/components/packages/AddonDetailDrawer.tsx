import React, { useState } from 'react'
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
import { useI18n } from '@pikku/react/i18n'
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
  const { t } = useI18n()
  const rpc = usePikkuRPC()
  const [tab, setTab] = useState<string | null>('overview')

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
      label: t('packages.surface_functions'),
      value: fnNames.length,
    },
    {
      icon: Globe,
      label: t('packages.surface_http'),
      value: countHttpRoutes(pkg?.httpRoutes),
    },
    {
      icon: Radio,
      label: t('packages.surface_channels'),
      value: Object.keys(pkg?.channels ?? {}).length,
    },
    {
      icon: KeyRound,
      label: t('packages.surface_secrets'),
      value: Object.keys(pkg?.secrets ?? {}).length,
    },
    {
      icon: Settings2,
      label: t('packages.surface_variables'),
      value: Object.keys(pkg?.variables ?? {}).length,
    },
    {
      icon: Bot,
      label: t('packages.surface_agents'),
      value: Object.keys(pkg?.agents ?? addon?.agents ?? {}).length,
    },
  ]

  const author = pkg?.author ?? addon?.author
  const version = pkg?.version ?? addon?.version
  const iconSrc =
    addon?.icon && addon.icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(addon.icon)}`
      : addon?.icon

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
              {t('packages.community')}
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
                    {asI18n(addon.displayName || addon.name)}
                  </Title>
                  {official ? (
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      leftSection={<ShieldCheck size={11} />}
                    >
                      {t('packages.official')}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="light" color="gray">
                      {t('packages.community')}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" ff="monospace">
                  {asI18n(addon.name)}
                </Text>
              </Stack>
            </Group>

            {addon.description && (
              <Text size="sm" c="dimmed" mt="md">
                {asI18n(addon.description)}
              </Text>
            )}

            {(addon.tags ?? []).length > 0 && (
              <Group gap={6} mt="sm">
                {addon.tags.map((tag) => (
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
                  {t('packages.added_to_project')}
                </Button>
              ) : (
                editable && (
                  <Button
                    leftSection={<Download size={15} />}
                    loading={installing}
                    onClick={() => onInstall(addon)}
                  >
                    {t('packages.add_to_project')}
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
                {t('packages.docs')}
              </Button>
            </Group>

            <Divider my="md" />

            <Group gap="xl">
              <Stack gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {t('packages.meta_version')}
                </Text>
                <Text size="sm" ff="monospace">
                  {asI18n(version ?? '—')}
                </Text>
              </Stack>
              {pkg?.license && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {t('packages.meta_license')}
                  </Text>
                  <Text size="sm">{asI18n(pkg.license)}</Text>
                </Stack>
              )}
              {author && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {t('packages.meta_author')}
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
                  {t('packages.tab_overview')}
                </Tabs.Tab>
                <Tabs.Tab value="functions">
                  {asI18n(`${t('packages.tab_functions')} (${fnNames.length})`)}
                </Tabs.Tab>
              </Tabs.List>
            </Box>

            <Tabs.Panel value="overview" p="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="sm">
                {t('packages.whats_included')}
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
                {t('packages.published_by')}
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
                  {t('packages.no_functions')}
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
                  {fnNames.map((name, i) => (
                    <Group
                      key={name}
                      justify="space-between"
                      px="md"
                      py="xs"
                      style={{
                        borderTop:
                          i === 0
                            ? undefined
                            : '1px solid var(--mantine-color-default-border)',
                      }}
                    >
                      <Text size="sm" fw={500}>
                        {asI18n(name)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  )
}
