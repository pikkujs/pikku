import React, { useState } from 'react'
import {
  Card,
  Group,
  Text,
  Badge,
  Button,
  ThemeIcon,
  Stack,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Check, Plus, Download, ShieldCheck, FunctionSquare, Bot, Globe } from 'lucide-react'
import type { PackageMeta } from '../../pages/PackagesPage'
import {
  getCategoryMeta,
  addonPrimaryCategory,
  isOfficialAddon,
} from './addonCategoryMeta'
import { AddonStatChip } from './AddonStatChip'

interface AddonCardProps {
  addon: PackageMeta
  installed: boolean
  installing: boolean
  editable: boolean
  /** 'api' swaps the action verb to Import and the stat row to an operation count. */
  kind?: 'addon' | 'api'
  onOpen: (addon: PackageMeta) => void
  onInstall: (addon: PackageMeta) => void
}

export const AddonCard: React.FC<AddonCardProps> = ({
  addon,
  installed,
  installing,
  editable,
  kind = 'addon',
  onOpen,
  onInstall,
}) => {
  useLocale()
  const [hovered, setHovered] = useState(false)
  const isApi = kind === 'api'
  const category = addonPrimaryCategory(addon)
  const { icon: CategoryIcon, color } = getCategoryMeta(category)
  const official = !isApi && isOfficialAddon(addon.name)
  const functionCount = Object.keys(addon.functions ?? {}).length
  const agentCount = Object.keys(addon.agents ?? {}).length
  const iconSrc = addon.icon
    ? addon.icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(addon.icon)}`
      : addon.icon
    : null

  return (
    <Card
      withBorder
      radius="md"
      padding={0}
      onClick={() => onOpen(addon)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? 'var(--mantine-shadow-md)' : undefined,
        borderColor: hovered
          ? 'var(--mantine-color-default-border)'
          : undefined,
        transition: 'transform 140ms ease, box-shadow 140ms ease',
      }}
    >
      <Stack gap="sm" p="md" style={{ flex: 1 }}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {iconSrc ? (
            <img
              src={iconSrc}
              width={44}
              height={44}
              alt={addon.displayName}
              style={{
                objectFit: 'contain',
                borderRadius: 10,
                display: 'block',
              }}
            />
          ) : (
            <ThemeIcon size={44} radius="md" variant="light" color={color}>
              <CategoryIcon size={22} />
            </ThemeIcon>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="sm" truncate>
              {asI18n(addon.displayName || addon.name)}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" truncate>
              {asI18n(addon.name)}
            </Text>
          </div>
          {isApi ? (
            addon.author && (
              <Badge
                size="sm"
                variant="light"
                color="gray"
                tt="none"
                style={{ flexShrink: 0 }}
              >
                {asI18n(addon.author)}
              </Badge>
            )
          ) : official ? (
            <Badge
              size="sm"
              variant="light"
              color="blue"
              leftSection={<ShieldCheck size={11} />}
              style={{ flexShrink: 0 }}
            >
              {m.packages_official()}
            </Badge>
          ) : (
            <Badge
              size="sm"
              variant="light"
              color="gray"
              style={{ flexShrink: 0 }}
            >
              {m.packages_community()}
            </Badge>
          )}
        </Group>

        {addon.description && (
          <Text
            size="sm"
            c="dimmed"
            lineClamp={2}
            style={{ minHeight: '2.6em' }}
          >
            {asI18n(addon.description)}
          </Text>
        )}

        {(addon.tags ?? []).length > 0 && (
          <Group gap={6}>
            {addon.tags.slice(0, 3).map((tag) => (
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
      </Stack>

      <Group
        justify="space-between"
        wrap="nowrap"
        px="md"
        py="sm"
        style={{
          borderTop: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-default-hover)',
        }}
      >
        <Group gap="lg" wrap="nowrap">
          {isApi ? (
            <AddonStatChip icon={Globe} value={addon.totalOperations ?? 0} />
          ) : (
            <>
              <AddonStatChip icon={FunctionSquare} value={functionCount} />
              <AddonStatChip icon={Bot} value={agentCount} />
            </>
          )}
        </Group>
        {installed ? (
          <Button
            size="xs"
            variant="light"
            color="green"
            leftSection={<Check size={13} />}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(addon)
            }}
          >
            {isApi ? m.packages_imported() : m.packages_added()}
          </Button>
        ) : editable ? (
          <Button
            size="xs"
            leftSection={isApi ? <Download size={13} /> : <Plus size={13} />}
            loading={installing}
            onClick={(e) => {
              e.stopPropagation()
              onInstall(addon)
            }}
          >
            {isApi ? m.packages_import() : m.packages_add()}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="default"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(addon)
            }}
          >
            {m.packages_view()}
          </Button>
        )}
      </Group>
    </Card>
  )
}
