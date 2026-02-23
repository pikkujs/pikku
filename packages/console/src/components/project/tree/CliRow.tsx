import React from 'react'
import { Group, Stack, Text, ActionIcon } from '@mantine/core'
import { Workflow } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import styles from './Row.module.css'

interface CliRowProps {
  name: string
  functionName?: string
  wireId: string
  data: any
}

export const CliRow: React.FunctionComponent<CliRowProps> = ({
  name,
  functionName,
  wireId,
  data,
}) => {
  const { openCLI, activePanel } = usePanelContext()

  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="md"
      className={`${styles.row} ${activePanel === `cli-${wireId}` ? styles.active : ''}`}
      style={{
        height: '100%',
        cursor: 'pointer',
      }}
      onClick={() => openCLI(wireId, data)}
    >
      <Stack gap={0} style={{ flex: 1 }}>
        <Text fw={600} size="md">
          {name}
        </Text>
        {functionName && (
          <Text size="sm" c="dimmed" fs="italic">
            → {functionName}
          </Text>
        )}
      </Stack>
      <ActionIcon variant="subtle" size="sm" className={styles.workflowIcon}>
        <Workflow size={16} />
      </ActionIcon>
    </Group>
  )
}
