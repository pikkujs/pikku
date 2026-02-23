import {
  Stack,
  Text,
  Box,
  Code,
  Group,
  Table,
  Loader,
  Card,
} from '@mantine/core'
import { useWorkflowNode, useWorkflowContext } from '@/context/WorkflowContext'
import { useOutputSchema } from '@/hooks/useWirings'
import { SchemaViewer } from '@/components/ui/SchemaViewer'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { workflowInputTypeDefs } from '@/components/ui/badge-defs'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { EmptyState } from '@/components/project/panels/shared/EmptyState'

interface WorkflowStepPanelProps {
  stepId: string
}

type InputBadgeType =
  | '$ref'
  | '$trigger'
  | '$state'
  | '$template'
  | '$static'
  | '$expression'

const TypeBadge: React.FunctionComponent<{
  type: InputBadgeType
  isHoverable?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}> = ({ type, isHoverable, onMouseEnter, onMouseLeave }) => {
  return (
    <PikkuBadge
      type="workflowInputType"
      value={type}
      style={{ cursor: isHoverable ? 'pointer' : 'default' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )
}

interface ParsedInputValue {
  type: InputBadgeType
  displayValue: React.ReactNode
  isHoverable?: boolean
  hoverRef?: string
}

const parseInputValue = (value: any): ParsedInputValue => {
  if (value === null || value === undefined) {
    return {
      type: '$static',
      displayValue: (
        <Text c="dimmed" size="sm">
          null
        </Text>
      ),
    }
  }

  if (typeof value === 'object' && value.$template) {
    const template = value.$template
    const elements: React.ReactNode[] = []

    for (let i = 0; i < template.parts.length; i++) {
      if (template.parts[i]) {
        elements.push(
          <Text key={`part-${i}`} span size="sm" ff="monospace">
            {template.parts[i]}
          </Text>
        )
      }

      if (i < template.expressions.length) {
        const expr = template.expressions[i]
        if (typeof expr === 'object' && expr.$ref) {
          const badgeType: InputBadgeType =
            expr.$ref === 'trigger' ? '$trigger' : '$ref'
          const displayPath = expr.path ? `.${expr.path}` : ''
          elements.push(
            <PikkuBadge
              key={`expr-${i}`}
              type="label"
              color={workflowInputTypeDefs[badgeType]?.color || 'gray'}
            >
              {expr.$ref + displayPath}
            </PikkuBadge>
          )
        } else {
          elements.push(
            <PikkuBadge
              key={`expr-${i}`}
              type="label"
              color={workflowInputTypeDefs.$expression?.color || 'cyan'}
            >
              {String(expr)}
            </PikkuBadge>
          )
        }
      }
    }

    return {
      type: '$template',
      displayValue: (
        <Group gap={4} wrap="wrap">
          {elements}
        </Group>
      ),
    }
  }

  if (typeof value === 'object' && value.$ref) {
    const isSpecial = value.$ref === 'trigger' || value.$ref === '$item'
    const badgeType: InputBadgeType =
      value.$ref === 'trigger' ? '$trigger' : '$ref'
    const displayPath = value.path ? `.${value.path}` : ''

    return {
      type: badgeType,
      displayValue: (
        <Text size="sm" ff="monospace">
          {value.$ref + displayPath}
        </Text>
      ),
      isHoverable: !isSpecial,
      hoverRef: value.$ref,
    }
  }

  if (typeof value === 'object' && value.$state) {
    return {
      type: '$state',
      displayValue: (
        <Text size="sm" ff="monospace">
          {value.$state}
        </Text>
      ),
    }
  }

  if (typeof value === 'object' && value.$expression) {
    return {
      type: '$expression',
      displayValue: (
        <Text size="sm" ff="monospace">
          {value.$expression}
        </Text>
      ),
    }
  }

  if (typeof value === 'object') {
    return {
      type: '$static',
      displayValue: <Code block>{JSON.stringify(value, null, 2)}</Code>,
    }
  }

  return {
    type: '$static',
    displayValue: (
      <Text size="sm" ff="monospace">
        {String(value)}
      </Text>
    ),
  }
}

export const WorkflowStepConfiguration: React.FunctionComponent<
  WorkflowStepPanelProps
> = ({ stepId }) => {
  const node = useWorkflowNode(stepId)
  const stepType = node?.flow || (node?.rpcName ? 'rpc' : 'unknown')

  return (
    <Stack gap={6}>
      <SectionLabel>Options</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        <Card.Section p="md">
          {node?.options ? (
            <Code block>{JSON.stringify(node.options, null, 2)}</Code>
          ) : (
            <EmptyState />
          )}
        </Card.Section>
      </Card>
    </Stack>
  )
}

export const WorkflowStepInput: React.FunctionComponent<
  WorkflowStepPanelProps
> = ({ stepId }) => {
  const node = useWorkflowNode(stepId)
  const { findNodeByOutputVar, setReferencedNode } = useWorkflowContext()
  const input = node?.input
  const hasInput = input && Object.keys(input).length > 0

  const handleRefHover = (ref: string | null) => {
    if (ref) {
      const nodeId = findNodeByOutputVar(ref)
      setReferencedNode(nodeId || null)
    } else {
      setReferencedNode(null)
    }
  }

  return (
    <Stack gap={6}>
      <SectionLabel>Input Parameters</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        {hasInput ? (
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Parameter
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Type
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Value
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(input).map(([key, value]) => {
                  const parsed = parseInputValue(value)
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>
                        <Text fw={500} ff="monospace" size="sm">
                          {key}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <TypeBadge
                          type={parsed.type}
                          isHoverable={parsed.isHoverable}
                          onMouseEnter={
                            parsed.isHoverable && parsed.hoverRef
                              ? () => handleRefHover(parsed.hoverRef!)
                              : undefined
                          }
                          onMouseLeave={
                            parsed.isHoverable
                              ? () => handleRefHover(null)
                              : undefined
                          }
                        />
                      </Table.Td>
                      <Table.Td>{parsed.displayValue}</Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Card.Section>
        ) : (
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        )}
      </Card>
    </Stack>
  )
}

const renderSchemaType = (schema: any): string => {
  if (!schema) return 'unknown'
  if (schema.type === 'array' && schema.items) {
    return `${renderSchemaType(schema.items)}[]`
  }
  if (schema.$ref) {
    return schema.$ref.replace('#/definitions/', '')
  }
  return schema.type || 'unknown'
}

export const WorkflowStepOutput: React.FunctionComponent<
  WorkflowStepPanelProps & { showOutputs?: boolean }
> = ({ stepId, showOutputs = false }) => {
  const node = useWorkflowNode(stepId)
  const outputs = node?.outputs
  const outputVar = node?.outputVar
  const rpcName = node?.rpcName
  const hasOutputs =
    outputs && typeof outputs === 'object' && Object.keys(outputs).length > 0

  const { data: schema, isLoading: schemaLoading } = useOutputSchema(rpcName)

  return (
    <Stack gap="md">
      <Stack gap={6}>
        <SectionLabel>Output Schema</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          {schemaLoading ? (
            <Card.Section p="md">
              <Loader size="xs" />
            </Card.Section>
          ) : schema?.properties ? (
            <Card.Section>
              <Table verticalSpacing={4} horizontalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th c="dimmed" fw={500} fz="xs">
                      Property
                    </Table.Th>
                    <Table.Th c="dimmed" fw={500} fz="xs">
                      Type
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(schema.properties).map(
                    ([key, prop]: [string, any]) => (
                      <Table.Tr key={key}>
                        <Table.Td>
                          <Group gap="xs">
                            <Text fw={500} ff="monospace" size="sm">
                              {key}
                            </Text>
                            {schema.required?.includes(key) && (
                              <PikkuBadge type="flag" flag="required" />
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" ff="monospace" c="dimmed">
                            {renderSchemaType(prop)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )
                  )}
                </Table.Tbody>
              </Table>
            </Card.Section>
          ) : schema ? (
            <Card.Section p="md">
              <SchemaViewer schema={schema} />
            </Card.Section>
          ) : (
            <Card.Section p="md">
              <EmptyState />
            </Card.Section>
          )}
        </Card>
      </Stack>

      <Stack gap={6}>
        <SectionLabel>Output Variable</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            {outputVar ? (
              <Group gap="xs">
                <Text ff="monospace">{outputVar}</Text>
                {schemaLoading && <Loader size="xs" />}
              </Group>
            ) : (
              <EmptyState />
            )}
          </Card.Section>
        </Card>
      </Stack>

      {showOutputs && (
        <Stack gap={6}>
          <SectionLabel>Outputs</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            {hasOutputs ? (
              <Card.Section>
                <Table verticalSpacing={4} horizontalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th c="dimmed" fw={500} fz="xs">
                        Output
                      </Table.Th>
                      <Table.Th c="dimmed" fw={500} fz="xs">
                        Source
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {Object.entries(outputs).map(
                      ([key, value]: [string, any]) => (
                        <Table.Tr key={key}>
                          <Table.Td>
                            <Text fw={500} ff="monospace" size="sm">
                              {key}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {value?.from && (
                              <Group gap="xs">
                                <PikkuBadge type="label">
                                  {value.from}
                                </PikkuBadge>
                                {value.name && (
                                  <Text size="sm" ff="monospace">
                                    {value.name}
                                  </Text>
                                )}
                                {value.expression && (
                                  <Text size="sm" ff="monospace">
                                    {value.expression}
                                  </Text>
                                )}
                                {value.path && (
                                  <>
                                    <Text size="sm" c="dimmed">
                                      .
                                    </Text>
                                    <Text size="sm" ff="monospace">
                                      {value.path}
                                    </Text>
                                  </>
                                )}
                              </Group>
                            )}
                            {!value?.from && (
                              <Code>{JSON.stringify(value, null, 2)}</Code>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )
                    )}
                  </Table.Tbody>
                </Table>
              </Card.Section>
            ) : (
              <Card.Section p="md">
                <EmptyState />
              </Card.Section>
            )}
          </Card>
        </Stack>
      )}
    </Stack>
  )
}

export const WorkflowStepBranches: React.FunctionComponent<
  WorkflowStepPanelProps
> = ({ stepId }) => {
  const node = useWorkflowNode(stepId)
  const flowType = node?.flow

  const flowLabel =
    flowType === 'branch'
      ? 'Branches'
      : flowType === 'switch'
        ? 'Cases'
        : flowType === 'parallel'
          ? 'Children'
          : flowType === 'fanout'
            ? 'Fanout'
            : 'Flow'

  return (
    <Stack gap="md">
      <Stack gap={6}>
        <SectionLabel>{flowLabel}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            {flowType === 'branch' && node?.branches ? (
              <Stack gap="xs">
                {node.branches.map((branch: any, index: number) => (
                  <Box
                    key={index}
                    p="sm"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                    }}
                  >
                    <Group gap="xs" mb="xs">
                      <PikkuBadge type="label">
                        {index === 0 ? 'if' : 'else if'}
                      </PikkuBadge>
                      <Text size="sm" ff="monospace">
                        {branch.condition?.expression || 'true'}
                      </Text>
                    </Group>
                    {branch.entry && (
                      <Text size="xs" c="dimmed">
                        Entry:{' '}
                        <Text span ff="monospace">
                          {branch.entry}
                        </Text>
                      </Text>
                    )}
                  </Box>
                ))}
              </Stack>
            ) : flowType === 'switch' && node?.cases ? (
              <Stack gap="xs">
                {node.cases.map((caseItem: any, index: number) => (
                  <Box
                    key={index}
                    p="sm"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                    }}
                  >
                    <Group gap="xs" mb="xs">
                      <PikkuBadge type="label">case</PikkuBadge>
                      <Text size="sm" ff="monospace">
                        {caseItem.value}
                      </Text>
                    </Group>
                    {caseItem.entry && (
                      <Text size="xs" c="dimmed">
                        Entry:{' '}
                        <Text span ff="monospace">
                          {caseItem.entry}
                        </Text>
                      </Text>
                    )}
                  </Box>
                ))}
                {node.defaultEntry && (
                  <Box
                    p="sm"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 'var(--mantine-radius-sm)',
                    }}
                  >
                    <Group gap="xs" mb="xs">
                      <PikkuBadge type="label" color="gray">
                        default
                      </PikkuBadge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Entry:{' '}
                      <Text span ff="monospace">
                        {node.defaultEntry}
                      </Text>
                    </Text>
                  </Box>
                )}
              </Stack>
            ) : flowType === 'parallel' && node?.children ? (
              <Stack gap="xs">
                {node.children.map((childId: string, index: number) => (
                  <Text key={index} size="sm" ff="monospace">
                    {childId}
                  </Text>
                ))}
              </Stack>
            ) : flowType === 'fanout' ? (
              <Stack gap="xs">
                {node?.sourceVar && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      Source:
                    </Text>
                    <Text size="sm" ff="monospace">
                      {node.sourceVar}
                    </Text>
                  </Group>
                )}
                {node?.itemVar && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      Item:
                    </Text>
                    <Text size="sm" ff="monospace">
                      {node.itemVar}
                    </Text>
                  </Group>
                )}
                {node?.mode && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      Mode:
                    </Text>
                    <PikkuBadge type="label">{node.mode}</PikkuBadge>
                  </Group>
                )}
                {node?.childEntry && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      Child Entry:
                    </Text>
                    <Text size="sm" ff="monospace">
                      {node.childEntry}
                    </Text>
                  </Group>
                )}
              </Stack>
            ) : (
              <EmptyState />
            )}
          </Card.Section>
        </Card>
      </Stack>

      <Stack gap={6}>
        <SectionLabel>Next Step</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            {node?.next ? (
              <Text ff="monospace">{node.next}</Text>
            ) : (
              <EmptyState />
            )}
          </Card.Section>
        </Card>
      </Stack>
    </Stack>
  )
}
