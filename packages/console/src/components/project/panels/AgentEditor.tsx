import React, { useState, useEffect } from 'react'
import {
  Stack,
  TextInput,
  Textarea,
  Select,
  MultiSelect,
  NumberInput,
  Button,
  Group,
  Alert,
} from '@mantine/core'
import { Save, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { useAgentSource, useUpdateAgentConfig } from '@/hooks/useCodeEdit'
import { useAddonFunctions } from '@/hooks/useAddonFunctions'
import { usePikkuMeta } from '@/context/PikkuMetaContext'

interface AgentEditorProps {
  wireId: string
  sourceFile: string
  exportedName: string
  metadata?: any
  onClose: () => void
}

export const AgentEditor: React.FunctionComponent<AgentEditorProps> = ({
  wireId,
  sourceFile,
  exportedName,
  metadata,
  onClose,
}) => {
  const { data: source, isLoading } = useAgentSource(
    sourceFile,
    exportedName,
    true
  )
  const updateAgent = useUpdateAgentConfig()
  const { meta } = usePikkuMeta()
  const { data: addonFunctions } = useAddonFunctions()
  const modelAliases = meta.modelAliases ?? []

  const [description, setDescription] = useState('')
  const [role, setRole] = useState('')
  const [personality, setPersonality] = useState('')
  const [goal, setGoal] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [maxSteps, setMaxSteps] = useState<number | ''>('')
  const [temperature, setTemperature] = useState<number | ''>('')
  const [toolChoice, setToolChoice] = useState<string | null>(null)
  const [tools, setTools] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (source) {
      const c = source.config || {}
      setDescription((c.description as string) || '')
      setRole((c.role as string) || '')
      setPersonality((c.personality as string) || '')
      setGoal((c.goal as string) || '')
      setModel((c.model as string) || null)
      setMaxSteps(typeof c.maxSteps === 'number' ? c.maxSteps : '')
      setTemperature(typeof c.temperature === 'number' ? c.temperature : '')
      setToolChoice((c.toolChoice as string) || null)
      setTools((metadata?.tools as string[]) || [])
    }
  }, [source])

  const handleSave = async () => {
    const original = source?.config || {}
    const changes: Record<string, unknown> = {}

    if (description !== (original.description || ''))
      changes.description = description || null
    if (role !== (original.role || ''))
      changes.role = role || null
    if (personality !== (original.personality || ''))
      changes.personality = personality || null
    if (goal !== (original.goal || ''))
      changes.goal = goal || null
    if (model !== (original.model || null))
      changes.model = model || undefined
    if (maxSteps !== (typeof original.maxSteps === 'number' ? original.maxSteps : ''))
      changes.maxSteps = typeof maxSteps === 'number' ? maxSteps : null
    if (temperature !== (typeof original.temperature === 'number' ? original.temperature : ''))
      changes.temperature = typeof temperature === 'number' ? temperature : null
    if (toolChoice !== (original.toolChoice || null))
      changes.toolChoice = toolChoice || null

    const origTools = (metadata?.tools as string[]) || []
    if (JSON.stringify(tools) !== JSON.stringify(origTools))
      changes.tools = tools.length > 0 ? tools : null

    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }

    try {
      await updateAgent.mutateAsync({ sourceFile, exportedName, changes })
      setSuccessMessage('Saved and rebuilt successfully')
      setTimeout(() => {
        setSuccessMessage(null)
        onClose()
      }, 1500)
    } catch {
      // error is in mutation state
    }
  }

  if (isLoading) {
    return null
  }

  const modelOptions = Array.from(new Set([...modelAliases, ...(model ? [model] : [])]))

  const allFunctions = meta.functions ?? []
  const groups: Record<string, string[]> = {}
  for (const f of allFunctions) {
    if ((f as any).functionType !== 'user') continue
    const id = (f as any).pikkuFuncId as string
    if (!groups['Local']) groups['Local'] = []
    groups['Local'].push(id)
  }
  for (const f of addonFunctions ?? []) {
    if (!groups[f.namespace]) groups[f.namespace] = []
    groups[f.namespace].push(f.funcId)
  }
  const toolOptions = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({
      group,
      items: items.sort(),
    }))

  return (
    <Stack gap="md">
      {successMessage && (
        <Alert
          color="green"
          icon={<CheckCircle size={16} />}
          withCloseButton
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      {updateAgent.error && (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {(updateAgent.error as Error).message}
        </Alert>
      )}

      <SectionLabel>Configuration</SectionLabel>
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={4}
        size="xs"
      />
      <Select
        label="Model"
        data={modelOptions}
        value={model}
        onChange={setModel}
        searchable
        clearable
        size="xs"
      />
      <Group grow gap="xs" wrap="wrap">
        <NumberInput
          label="Max Steps"
          style={{ minWidth: 100 }}
          value={maxSteps}
          onChange={(v) => setMaxSteps(typeof v === 'number' ? v : '')}
          min={1}
          max={100}
          size="xs"
        />
        <NumberInput
          label="Temperature"
          style={{ minWidth: 100 }}
          value={temperature}
          onChange={(v) => setTemperature(typeof v === 'number' ? v : '')}
          min={0}
          max={2}
          step={0.1}
          decimalScale={1}
          size="xs"
        />
        <Select
          label="Tool Choice"
          style={{ minWidth: 120 }}
          data={['auto', 'required', 'none']}
          value={toolChoice}
          onChange={setToolChoice}
          clearable
          size="xs"
        />
      </Group>

      <MultiSelect
        label="Tools"
        data={toolOptions}
        value={tools}
        onChange={setTools}
        searchable
        clearable
        size="xs"
        placeholder="Search functions..."
      />

      <SectionLabel>Role</SectionLabel>
      <Textarea
        value={role}
        onChange={(e) => setRole(e.currentTarget.value)}
        placeholder="Who the agent is — role, expertise, domain context"
        autosize
        minRows={2}
        maxRows={6}
        styles={{
          input: { fontFamily: 'monospace', fontSize: '13px' },
        }}
      />

      <SectionLabel>Personality</SectionLabel>
      <Textarea
        value={personality}
        onChange={(e) => setPersonality(e.currentTarget.value)}
        placeholder="Defines how the agent behaves — tone, style, constraints"
        autosize
        minRows={3}
        maxRows={10}
        styles={{
          input: { fontFamily: 'monospace', fontSize: '13px' },
        }}
      />

      <SectionLabel>Goal</SectionLabel>
      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.currentTarget.value)}
        placeholder="Defines what the agent is trying to accomplish"
        autosize
        minRows={3}
        maxRows={10}
        styles={{
          input: { fontFamily: 'monospace', fontSize: '13px' },
        }}
      />

      <Group gap="xs" justify="flex-end">
        <Button
          variant="subtle"
          onClick={onClose}
          disabled={updateAgent.isPending}
          leftSection={<X size={14} />}
          size="xs"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          loading={updateAgent.isPending}
          leftSection={<Save size={14} />}
          size="xs"
        >
          Save & Rebuild
        </Button>
      </Group>
    </Stack>
  )
}
