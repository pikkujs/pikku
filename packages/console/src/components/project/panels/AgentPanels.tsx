import React, { useContext, useMemo, useState } from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Select,
  NumberInput,
  ActionIcon,
} from '@mantine/core'
import { Bot, Pencil } from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { CommonDetails } from '@/components/project/panels/shared/CommonDetails'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { LinkedBadge } from '@/components/project/panels/LinkedBadge'
import { SchemaSection } from '@/components/project/panels/shared/SchemaSection'
import { usePanelContext } from '@/context/PanelContext'
import { AgentPlaygroundContext } from '@/context/AgentPlaygroundContext'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { AgentEditor } from '@/components/project/panels/AgentEditor'

interface AgentPanelProps {
  wireId: string
  metadata?: any
}

export const AgentConfiguration: React.FunctionComponent<AgentPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  const { navigateInPanel } = usePanelContext()
  const playgroundCtx = useContext(AgentPlaygroundContext)
  const { meta } = usePikkuMeta()
  const modelAliases = meta.modelAliases ?? []
  const [editing, setEditing] = useState(false)

  const canEdit = !!metadata?.sourceFile && !!metadata?.exportedName

  const modelOptions = useMemo(() => {
    const aliases = new Set(modelAliases)
    if (metadata?.model) aliases.add(metadata.model)
    return Array.from(aliases) as string[]
  }, [modelAliases, metadata?.model])

  if (editing && canEdit) {
    return (
      <AgentEditor
        wireId={wireId}
        sourceFile={metadata.sourceFile}
        exportedName={metadata.exportedName}
        metadata={metadata}
        onClose={() => setEditing(false)}
      />
    )
  }

  const middleware = metadata?.middleware || []
  const channelMiddleware = metadata?.channelMiddleware || []
  const aiMiddleware = metadata?.aiMiddleware || []
  const permissions = metadata?.permissions || []
  const tools = metadata?.tools || []
  const subAgents = metadata?.agents || []
  const memory = metadata?.memory

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <Bot size={20} />
            <Text size="lg" ff="monospace" fw={600}>
              {metadata?.name || wireId}
            </Text>
            {metadata?.model && (
              <PikkuBadge type="dynamic" badge="model" value={metadata.model} />
            )}
          </Group>
          {canEdit && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setEditing(true)}
              title="Edit agent"
            >
              <Pencil size={14} />
            </ActionIcon>
          )}
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="agent" />
        {metadata?.maxSteps && (
          <PikkuBadge
            type="dynamic"
            badge="maxSteps"
            value={metadata.maxSteps}
            variant="outline"
            color="gray"
          />
        )}
        {metadata?.toolChoice && (
          <PikkuBadge
            type="dynamic"
            badge="toolChoice"
            value={metadata.toolChoice}
            variant="outline"
            color="gray"
          />
        )}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      {playgroundCtx && (
        <Box>
          <SectionLabel>Playground Overrides</SectionLabel>
          <Stack gap="xs">
            {modelOptions.length > 0 && (
              <Select
                size="xs"
                label={`Model${metadata?.model ? ` (default: ${metadata.model})` : ''}`}
                placeholder={metadata?.model ?? 'default'}
                data={modelOptions}
                value={playgroundCtx.model ?? null}
                onChange={(v) => playgroundCtx.setModel(v ?? undefined)}
                clearable
              />
            )}
            <NumberInput
              size="xs"
              label={`Temperature${metadata?.temperature != null ? ` (default: ${metadata.temperature})` : ''}`}
              placeholder={metadata?.temperature != null ? String(metadata.temperature) : 'default'}
              value={playgroundCtx.temperature ?? ''}
              onChange={(v) => playgroundCtx.setTemperature(typeof v === 'number' ? v : undefined)}
              min={0}
              max={2}
              step={0.1}
              decimalScale={1}
            />
          </Stack>
        </Box>
      )}

      <CommonDetails
        description={metadata?.description}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags}
      >
        {metadata?.role && (
          <Box>
            <SectionLabel>Role</SectionLabel>
            <Text size="md" style={{ whiteSpace: 'pre-wrap' }}>
              {metadata.role}
            </Text>
          </Box>
        )}

        {metadata?.personality && (
          <Box>
            <SectionLabel>Personality</SectionLabel>
            <Text size="md" style={{ whiteSpace: 'pre-wrap' }}>
              {metadata.personality}
            </Text>
          </Box>
        )}

        {metadata?.goal && (
          <Box>
            <SectionLabel>Goal</SectionLabel>
            <Text size="md" style={{ whiteSpace: 'pre-wrap' }}>
              {metadata.goal}
            </Text>
          </Box>
        )}

        {tools.length > 0 && (
          <Box>
            <SectionLabel>Tools ({tools.length})</SectionLabel>
            <Group gap={6}>
              {tools.map((tool: string) => (
                <PikkuBadge
                  key={tool}
                  type="dynamic"
                  badge="tool"
                  value={tool}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigateInPanel('function', tool, tool)}
                />
              ))}
            </Group>
          </Box>
        )}

        {subAgents.length > 0 && (
          <Box>
            <SectionLabel>Sub-Agents ({subAgents.length})</SectionLabel>
            <Group gap={6}>
              {subAgents.map((agent: string) => (
                <PikkuBadge
                  key={agent}
                  type="dynamic"
                  badge="agent"
                  value={agent}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigateInPanel('agent', agent, agent)}
                />
              ))}
            </Group>
          </Box>
        )}

        {channelMiddleware.length > 0 && (
          <Box>
            <SectionLabel>Channel Middleware</SectionLabel>
            <Group gap={6}>
              {channelMiddleware.map((mw: any, i: number) => (
                <LinkedBadge key={i} item={mw} kind="middleware" />
              ))}
            </Group>
          </Box>
        )}

        {aiMiddleware.length > 0 && (
          <Box>
            <SectionLabel>AI Middleware</SectionLabel>
            <Group gap={6}>
              {aiMiddleware.map((mw: any, i: number) => (
                <LinkedBadge key={i} item={mw} kind="middleware" />
              ))}
            </Group>
          </Box>
        )}

        {memory && (
          <Box>
            <SectionLabel>Memory</SectionLabel>
            <Group gap={6}>
              {memory.storage && (
                <PikkuBadge
                  type="dynamic"
                  badge="storage"
                  value={memory.storage}
                  variant="outline"
                  color="gray"
                />
              )}
              {memory.lastMessages !== undefined && (
                <PikkuBadge
                  type="dynamic"
                  badge="lastMessages"
                  value={memory.lastMessages}
                  variant="outline"
                  color="gray"
                />
              )}
            </Group>
          </Box>
        )}

        <SchemaSection
          label="Input Schema"
          schemaName={metadata?.inputSchema}
        />
        <SchemaSection
          label="Output Schema"
          schemaName={metadata?.outputSchema}
        />
        <SchemaSection
          label="Working Memory Schema"
          schemaName={metadata?.workingMemorySchema}
        />
      </CommonDetails>
    </Stack>
  )
}
