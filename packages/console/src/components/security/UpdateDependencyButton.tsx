import React from 'react'
import { Button, Group, Loader, Text, Tooltip } from '@pikku/mantine/core'
import { ArrowUpRight } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useUpdateDependency } from '../../hooks/useSecurityAudit'

/**
 * OSS "Update dependency" remediation — the free, mechanical path: bump
 * package.json + `bun install`, nothing more. Rendered as a compact action in
 * the finding row header. Fabric passes its own ("Ask Pikku to fix":
 * sandbox-verified) in its place via {@link SecurityAuditView}'s
 * `renderRemediation`.
 */
export const UpdateDependencyButton: React.FC<{
  pkg: string
  version: string
}> = ({ pkg, version }) => {
  const update = useUpdateDependency()
  const pending = update.isPending
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {update.isError && (
        <Text span size="xs" c="red" data-testid="security-update-error">
          {m.security_update_dep_error()}
        </Text>
      )}
      <Tooltip
        label={m.security_update_dep_desc({ package: pkg, version })}
        multiline
        w={260}
        withArrow
        position="bottom-end"
      >
        <Button
          size="xs"
          variant="default"
          data-testid="security-update-dep"
          leftSection={
            pending ? <Loader size={12} /> : <ArrowUpRight size={14} />
          }
          disabled={pending}
          loading={pending}
          onClick={() => update.mutate({ package: pkg, version })}
        >
          {m.security_update_dep_btn({ version })}
        </Button>
      </Tooltip>
    </Group>
  )
}
