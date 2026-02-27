import React from 'react'
import { Accordion, Group, Text, Stack, Badge, Box } from '@mantine/core'
import { FunctionLink } from '@/components/project/panels/shared/FunctionLink'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import type { ChannelSelection } from './ChannelNavTree'

interface ChannelWiringsExplorerProps {
  messageWirings: Record<string, Record<string, any>> | undefined
  selected: ChannelSelection
  onSelectAction: (category: string, action: string) => void
}

export const ChannelWiringsExplorer: React.FunctionComponent<
  ChannelWiringsExplorerProps
> = ({ messageWirings, selected, onSelectAction }) => {
  if (!messageWirings || Object.keys(messageWirings).length === 0) return null

  const categories = Object.entries(messageWirings)

  return (
    <Accordion variant="separated" multiple defaultValue={categories.map(([cat]) => cat)}>
      {categories.map(([category, actions]) => {
        const actionEntries = Object.entries(actions)

        return (
          <Accordion.Item key={category} value={category}>
            <Accordion.Control>
              <Group gap="xs">
                <Text size="sm" fw={600}>
                  {category}
                </Text>
                <Badge size="xs" variant="light" color="teal" tt="none">
                  {actionEntries.length} action{actionEntries.length !== 1 ? 's' : ''}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {actionEntries.map(([actionName, actionData]) => {
                  const isSelected =
                    selected?.type === 'action' &&
                    selected.category === category &&
                    selected.action === actionName
                  const middlewareCount = actionData?.middleware?.length || 0
                  const permissionCount = actionData?.permissions?.length || 0

                  return (
                    <Box
                      key={actionName}
                      p="xs"
                      style={{
                        borderRadius: 4,
                        cursor: 'pointer',
                        backgroundColor: isSelected
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                      }}
                      onClick={() => onSelectAction(category, actionName)}
                    >
                      <Group gap="xs">
                        <Text size="sm" ff="monospace">
                          {actionName}
                        </Text>
                        {actionData?.pikkuFuncId && (
                          <FunctionLink pikkuFuncId={actionData.pikkuFuncId} />
                        )}
                        {middlewareCount > 0 && (
                          <PikkuBadge
                            type="dynamic"
                            badge="middleware"
                            value={middlewareCount}
                            size="xs"
                          />
                        )}
                        {permissionCount > 0 && (
                          <PikkuBadge
                            type="dynamic"
                            badge="permission"
                            value={permissionCount}
                            size="xs"
                          />
                        )}
                      </Group>
                    </Box>
                  )
                })}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )
      })}
    </Accordion>
  )
}
