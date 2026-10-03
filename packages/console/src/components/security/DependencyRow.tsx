import React from 'react'
import { Badge, Box, Checkbox, Group, Text } from '@pikku/mantine/core'
import { Package, ShieldCheck } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  SEV_ORDER,
  SEV_COLOR,
  SEV_LABEL,
  LEVEL_COLOR,
  LEVEL_LABEL,
  type DepInfo,
  type RenderUpgradeFor,
} from './security-view-utils'
import { isUpgradable } from './upgrade-prompt'

export interface DependencyRowProps {
  dep: DepInfo
  first: boolean
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  renderUpgrade: RenderUpgradeFor
}

export const DependencyRow: React.FC<DependencyRowProps> = ({
  dep,
  first,
  selected,
  onSelectedChange,
  renderUpgrade,
}) => {
  const upgradable = isUpgradable(dep)
  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="sm"
      style={{
        borderTop: first
          ? undefined
          : '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Checkbox
        size="xs"
        checked={selected}
        disabled={!upgradable}
        onChange={(e) => onSelectedChange(e.currentTarget.checked)}
        aria-label={m.security_select_dep({ package: dep.name })}
        data-testid="security-dep-select"
      />
      <Box
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Package size={16} />
      </Box>
      <Box style={{ minWidth: 190 }}>
        <Text size="sm" fw={600} ff="monospace">
          {asI18n(dep.name)}
        </Text>
        <Group gap={6} align="center" mt={2}>
          <Text span size="xs" c="dimmed" ff="monospace">
            {asI18n(
              dep.current && dep.latest
                ? `${dep.current} → ${dep.latest}`
                : (dep.latest ?? dep.current ?? '')
            )}
          </Text>
          <Badge size="xs" variant="light" color={LEVEL_COLOR[dep.level]}>
            {LEVEL_LABEL[dep.level]()}
          </Badge>
        </Group>
      </Box>
      <Group gap={6} style={{ flex: 1 }} wrap="wrap">
        {dep.total === 0 ? (
          <Group gap={6} align="center">
            <ShieldCheck size={13} color="var(--mantine-color-green-7)" />
            <Text span size="xs" c="green">
              {m.security_dep_no_vulns()}
            </Text>
          </Group>
        ) : (
          SEV_ORDER.filter((s) => dep.counts[s] > 0).map((s) => (
            <Badge
              key={s}
              size="xs"
              variant="light"
              color={SEV_COLOR[s]}
              ff="monospace"
            >
              {asI18n(`${dep.counts[s]} ${SEV_LABEL[s]()}`)}
            </Badge>
          ))
        )}
      </Group>
      {upgradable && renderUpgrade(dep.name)}
    </Group>
  )
}
