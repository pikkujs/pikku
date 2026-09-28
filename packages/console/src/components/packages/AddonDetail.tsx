import React, { useState } from 'react'
import {
  Group,
  Stack,
  Text,
  Button,
  ThemeIcon,
  Alert,
  TextInput,
  List,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { rememberInstallResult, type AddonInstallResult } from './installResult'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, TriangleAlert } from 'lucide-react'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { plainSummary, type InstalledAddonRow, type PackageMeta } from './packageMeta'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevField, DevFields, DevLinks } from '../ui/DevDetail'
import { StatusBadge } from '../ui/StatusBadge'
import { addonJob } from './addonJobs'
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

export interface AddonDetailProps {
  addon: PackageMeta
  /** 'api' fetches OpenAPI detail instead of a community package and swaps the CTA to Import. */
  kind?: 'addon' | 'api'
  /**
   * Whether this console may install. Passed in rather than read from
   * `useConsoleEditable()` because panel content renders outside the page's
   * provider tree, where that context would silently fall back to its `true`
   * default and offer Install on a read-only deployed stage.
   */
  editable: boolean
  /** Land on the freshly installed addon's setup surface. */
  onInstalled?: (packageName: string) => void
}

/**
 * What an addon contains and the control that installs it.
 *
 * Carries no surface of its own: this is panel content, opened through
 * `openAddon` so it lands wherever the surrounding app puts panels — the
 * console's own pane, or an embedding host's end-edge panel. It used to be a
 * 620px right-hand `Drawer`, which ignored both and covered the catalogue it
 * was describing.
 *
 * It owns the install mutation and re-reads `installed-addons` rather than
 * taking progress as props: a panel's content is built from the metadata
 * captured when it opened, so anything that changes while it is open has to
 * live inside it.
 */
export const AddonDetail: React.FC<AddonDetailProps> = ({
  addon,
  kind = 'addon',
  editable,
  onInstalled,
}) => {
  useLocale()
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  const isApi = kind === 'api'

  // The wireAddon name for this install — defaults to the derived slug, editable
  // so the same package can be wired under a distinct name.
  const [name, setName] = useState(isApi ? '' : deriveNamespace(addon.name))
  const nameValid = isApi || isValidNamespace(name)

  // Shares AddonsList's query key, so installing here updates the catalogue
  // behind the panel and the panel's own CTA from one invalidation.
  const { data: installedAddons } = useQuery<InstalledAddonRow[]>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddonRow[]
    },
    staleTime: 60 * 1000,
  })
  // An imported API is registered under a DERIVED package name
  // (@pikku/addon-<slug>), not the catalogue's own name — match on that or an
  // already-imported API reads as available.
  const packageName = isApi
    ? `@pikku/addon-${deriveNamespace(addon.name)}`
    : addon.name
  const installedNamespaces = (installedAddons ?? [])
    .filter((row) => row.packageName === packageName)
    .map((row) => row.namespace)
  const installed = installedNamespaces.length > 0

  const installMutation = useMutation({
    mutationFn: async (namespace?: string) =>
      isApi
        ? // Generates a local @pikku/addon-<slug> from the spec and wires it up;
          // it then appears in getInstalledAddons like any other addon.
          rpc.invoke('console:installOpenapiAddon', {
            name: deriveNamespace(addon.name),
            // apiToPackageMeta always sets swaggerUrl on API-kind rows.
            swaggerUrl: addon.swaggerUrl!,
          })
        : rpc.invoke('console:installAddon', {
            packageName: addon.name,
            namespace: namespace?.trim() || deriveNamespace(addon.name),
            version: addon.version,
          }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      // installOpenapiAddon reports no readiness — only a package install does.
      if (!isApi) {
        rememberInstallResult(
          queryClient,
          addon.name,
          result as AddonInstallResult
        )
      }
      onInstalled?.(addon.name)
    },
  })
  const installError = installMutation.error
    ? installMutation.error instanceof Error
      ? installMutation.error.message
      : String(installMutation.error)
    : null

  const { data: pkg } = useQuery<CommunityPackage | null>({
    queryKey: ['addon', 'community', addon.id],
    queryFn: async () =>
      (await rpc.invoke('console:getAddonCommunityPackage', {
        id: addon.id,
      })) as CommunityPackage | null,
    enabled: !isApi,
  })

  const { data: apiDetail } = useQuery<OpenApiDetail | null>({
    queryKey: ['api', 'detail', addon.id],
    queryFn: async () =>
      (await rpc.invoke('console:getOpenapiDetail', {
        name: addon.name,
      })) as OpenApiDetail | null,
    enabled: isApi,
  })

  const official = !isApi && isOfficialAddon(addon.name)
  const { icon: CategoryIcon, color } = getCategoryMeta(
    addonPrimaryCategory(addon)
  )

  const fnRecord = pkg?.functions ?? addon.functions ?? {}
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
  const agentNames = isApi
    ? []
    : Object.keys(pkg?.agents ?? addon.agents ?? {})
  const description = pkg?.description ?? addon.description
  const tags = pkg?.tags ?? addon.tags ?? []
  const author = pkg?.author ?? addon.author
  const version = pkg?.version ?? addon.version
  const iconRaw = pkg?.icon ?? addon.icon
  const iconSrc =
    iconRaw && iconRaw.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconRaw)}`
      : iconRaw
  const docsHref = isApi
    ? (apiDetail?.swaggerUrl ??
      addon.swaggerUrl ??
      'https://pikku.dev/docs/external-packages')
    : 'https://pikku.dev/docs/external-packages'

  const brand = addon.displayName || addon.name
  const job = isApi ? undefined : addonJob(addon.name)
  const needsKeys = secretNames.length > 0 || variableNames.length > 0
  const needsReady = isApi || pkg !== undefined
  const needs = isApi
    ? [m.integrations_need_maybe_account({ name: brand })]
    : needsKeys
      ? [
          m.integrations_need_account({ name: brand }),
          m.integrations_need_keys({ name: brand }),
        ]
      : [m.integrations_need_nothing()]
  const steps = isApi
    ? [m.integrations_step_add(), m.integrations_step_use()]
    : [
        m.integrations_step_name(),
        m.integrations_step_add(),
        ...(needsKeys ? [m.integrations_step_keys({ name: brand })] : []),
        m.integrations_step_use(),
      ]

  return (
    <Stack gap="lg" p="lg" data-testid={`addon-detail-${addon.name}`}>
      <Group gap="md" wrap="nowrap" align="center">
        {iconSrc ? (
          <ThemeIcon size={56} radius="md" variant="default">
            <img
              src={iconSrc}
              width={36}
              height={36}
              alt=""
              style={{ objectFit: 'contain', display: 'block' }}
            />
          </ThemeIcon>
        ) : (
          <ThemeIcon size={56} radius="md" variant="light" color={color}>
            <CategoryIcon size={28} />
          </ThemeIcon>
        )}
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="lg">
            {job ?? asI18n(brand)}
          </Text>
          {(official || author) && (
            <Text size="sm" c="dimmed">
              {official
                ? m.integrations_made_by_fabric()
                : m.integrations_made_by({ author })}
            </Text>
          )}
        </Stack>
      </Group>

      {installed && (
        <Group gap="xs">
          <StatusBadge tone="good">
            {isApi
              ? m.packages_imported_to_project()
              : m.integrations_added_to_app()}
          </StatusBadge>
        </Group>
      )}

      <Stack gap={6}>
        <Text fw={600}>{m.integrations_for_title()}</Text>
        {description ? (
          <Text size="sm" c="dimmed">
            {asI18n(plainSummary(description))}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            {m.integrations_for_fallback({ name: brand })}
          </Text>
        )}
      </Stack>

      {needsReady && (
        <Stack gap={6}>
          <Text fw={600}>{m.integrations_need_title()}</Text>
          <List size="sm" spacing={4}>
            {needs.map((need, i) => (
              <List.Item key={i}>{need}</List.Item>
            ))}
          </List>
        </Stack>
      )}

      {!installed && (
        <Stack gap="sm">
          <Text fw={600}>{m.integrations_steps_title()}</Text>
          <List type="ordered" size="sm" spacing={4}>
            {steps.map((step, i) => (
              <List.Item key={i}>{step}</List.Item>
            ))}
          </List>
          {!editable && (
            <Text size="sm" c="dimmed">
              {m.integrations_readonly_hint()}
            </Text>
          )}
          {editable && !isApi && (
            <TextInput
              label={m.integrations_name_label()}
              description={m.integrations_name_hint()}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              data-testid="addon-install-name"
              error={
                name.length > 0 && !nameValid
                  ? m.packages_install_name_invalid()
                  : null
              }
            />
          )}
          {editable && (
            <Group>
              <Button
                leftSection={<Plus size={15} />}
                loading={installMutation.isPending}
                disabled={!nameValid}
                data-testid="addon-install-submit"
                onClick={() => installMutation.mutate(isApi ? undefined : name)}
              >
                {m.integrations_add()}
              </Button>
            </Group>
          )}
        </Stack>
      )}

      {installError && (
        <Alert
          color="red"
          variant="light"
          icon={<TriangleAlert size={15} />}
          data-testid="addon-install-error"
        >
          <Text size="sm">
            {isApi
              ? m.packages_import_error({ name: brand, message: installError })
              : m.packages_install_error({
                  name: brand,
                  message: installError,
                })}
          </Text>
        </Alert>
      )}

      <ForDevelopers
        label={m.integrations_dev_label()}
        hint={m.integrations_detail_dev_hint()}
        testId="integrations-detail-developers"
      >
        <DevFields>
          <DevField
            label={m.integrations_package()}
            value={isApi ? packageName : addon.name}
          />
          <DevField label={m.packages_meta_version()} value={version} />
          {pkg?.license && (
            <DevField
              label={m.packages_meta_license()}
              value={pkg.license}
              mono={false}
              copy={false}
            />
          )}
          {installedNamespaces.length > 0 && (
            <DevField
              label={m.packages_installed_as()}
              value={installedNamespaces.join(', ')}
            />
          )}
          {tags.length > 0 && (
            <DevField label={m.dev_tags()} value={tags.join(' ')} copy={false} />
          )}
          {isApi && (
            <DevField
              label={m.packages_surface_operations()}
              value={String(
                apiDetail?.totalOperations ?? addon.totalOperations ?? 0
              )}
              copy={false}
            />
          )}
          {fnNames.length > 0 && (
            <DevField
              label={asI18n(`${m.packages_tab_functions()} (${fnNames.length})`)}
              value={fnNames.join(', ')}
            />
          )}
          {httpRouteRows.length > 0 && (
            <DevField
              label={asI18n(
                `${m.packages_surface_http()} (${httpRouteRows.length})`
              )}
              value={httpRouteRows
                .map(({ method, route }) => `${method.toUpperCase()} ${route}`)
                .join('\n')}
            />
          )}
          {channelNames.length > 0 && (
            <DevField
              label={asI18n(
                `${m.packages_surface_channels()} (${channelNames.length})`
              )}
              value={channelNames.join(', ')}
            />
          )}
          {secretNames.length > 0 && (
            <DevField
              label={asI18n(
                `${m.packages_surface_secrets()} (${secretNames.length})`
              )}
              value={secretNames
                .map((name) => secretsRecord[name]?.secretId ?? name)
                .join(', ')}
            />
          )}
          {variableNames.length > 0 && (
            <DevField
              label={asI18n(
                `${m.packages_surface_variables()} (${variableNames.length})`
              )}
              value={variableNames
                .map((name) => variablesRecord[name]?.variableId ?? name)
                .join(', ')}
            />
          )}
          {agentNames.length > 0 && (
            <DevField
              label={asI18n(
                `${m.packages_surface_agents()} (${agentNames.length})`
              )}
              value={agentNames.join(', ')}
            />
          )}
        </DevFields>
        <DevLinks links={[{ href: docsHref, label: m.packages_docs() }]} />
      </ForDevelopers>
    </Stack>
  )
}
