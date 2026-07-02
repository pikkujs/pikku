import React from 'react'
import { Badge, Box, Button, Group, Loader, Text } from '@pikku/mantine/core'
import { Package, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useUpdateDependency } from '../../hooks/useSecurityAudit'
import {
  SEV_ORDER,
  SEV_COLOR,
  SEV_LABEL,
  LEVEL_COLOR,
  LEVEL_LABEL,
  type DepInfo,
} from './security-view-utils'

export interface DependencyRowProps {
  dep: DepInfo
  first: boolean
}

export const DependencyRow: React.FC<DependencyRowProps> = ({ dep, first }) => {
  const update = useUpdateDependency()
  const pending = update.isPending
  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="sm"
      style={{
        borderTop: first ? undefined : '1px solid var(--mantine-color-default-border)',
      }}
    >
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
            <Badge key={s} size="xs" variant="light" color={SEV_COLOR[s]} ff="monospace">
              {asI18n(`${dep.counts[s]} ${SEV_LABEL[s]()}`)}
            </Badge>
          ))
        )}
      </Group>
      {dep.total > 0 && dep.latest && (
        <Group gap="xs" wrap="nowrap" align="center">
          {update.isError && (
            <Text span size="xs" c="red" data-testid="security-dep-update-error">
              {m.security_update_dep_error()}
            </Text>
          )}
          <Button
            size="xs"
            variant="default"
            leftSection={
              pending ? <Loader size={12} /> : <ArrowUpRight size={14} />
            }
            disabled={pending}
            loading={pending}
            onClick={() =>
              update.mutate({ package: dep.name, version: dep.latest! })
            }
          >
            {m.security_dep_update()}
          </Button>
        </Group>
      )}
    </Group>
  )
}
