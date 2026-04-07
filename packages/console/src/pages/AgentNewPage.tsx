import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Stack,
  Textarea,
  TextInput,
  Button,
  Alert,
  Group,
  Text,
  Box,
  MultiSelect,
  Switch,
} from '@mantine/core'
import {
  Sparkles,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { useNavigate } from '@/router'
import { useGenerateAgent } from '@/hooks/useAgentEditor'
import { useWorkflowRun, useWorkflowRunSteps } from '@/hooks/useWorkflowRuns'
import { useAddonFunctions } from '@/hooks/useAddonFunctions'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { GenerationTimeline } from '@/components/workflow/GenerationTimeline'

type Status = 'idle' | 'generating' | 'success' | 'failed'

const getToolCountHint = (
  count: number
): { message: string; color: string } => {
  if (count < 5) return { message: 'Good — focused agent', color: 'teal' }
  if (count < 10)
    return { message: 'Doable — agent has many tools', color: 'yellow' }
  if (count < 20)
    return {
      message: 'Problematic — consider splitting into sub-agents',
      color: 'orange',
    }
  return {
    message: 'Too many — split into multiple specialized agents',
    color: 'red',
  }
}

export const AgentNewPage: React.FunctionComponent = () => {
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([])
  const [allowSubAgents, setAllowSubAgents] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const generateAgent = useGenerateAgent()
  const { data: run } = useWorkflowRun(runId)
  const { data: steps } = useWorkflowRunSteps(runId)
  const { meta } = usePikkuMeta()
  const { data: addonFunctions } = useAddonFunctions()

  useEffect(() => {
    if (run?.status === 'completed') {
      setStatus('success')
    } else if (run?.status === 'failed') {
      setStatus('failed')
      setError(run.error?.message || 'Agent generation failed')
    }
  }, [run?.status])

  const { functionOptions, addonGroups } = useMemo(() => {
    const groups: Record<string, string[]> = {}
    for (const f of meta.functions ?? []) {
      if ((f as Record<string, unknown>).functionType !== 'user') continue
      const id = (f as Record<string, unknown>).pikkuFuncId as string
      if (id.startsWith('pikkuWorkflow') || id.startsWith('http:')) continue
      if (!groups['Local']) groups['Local'] = []
      groups['Local'].push(id)
    }
    for (const f of addonFunctions ?? []) {
      if (!groups[f.namespace]) groups[f.namespace] = []
      groups[f.namespace].push(f.funcId)
    }

    const options: Array<{
      group: string
      items: Array<{ value: string; label: string }>
    }> = []

    const addonEntries = Object.entries(groups)
      .filter(([g]) => g !== 'Local')
      .sort(([a], [b]) => a.localeCompare(b))
    if (addonEntries.length > 0) {
      options.push({
        group: 'Addons',
        items: addonEntries.map(([g, fns]) => ({
          value: `addon:${g}`,
          label: `${g} (all ${fns.length})`,
        })),
      })
    }

    for (const [group, fns] of Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      options.push({
        group,
        items: fns.sort().map((id) => ({ value: id, label: id })),
      })
    }

    return {
      functionOptions: options,
      addonGroups: groups,
    }
  }, [meta.functions, addonFunctions])

  const expandedFunctionCount = useMemo(() => {
    return selectedFunctions.reduce((count, f) => {
      if (f.startsWith('addon:')) {
        return count + (addonGroups[f.slice(6)]?.length ?? 0)
      }
      return count + 1
    }, 0)
  }, [selectedFunctions, addonGroups])

  const handleFunctionChange = useCallback(
    (values: string[]) => {
      let result = [...values]
      for (const val of values) {
        if (val.startsWith('addon:')) {
          const ns = val.slice(6)
          const funcs = addonGroups[ns] ?? []
          result = result.filter(
            (v) => !funcs.includes(v) || v.startsWith('addon:')
          )
        }
      }
      setSelectedFunctions(result)
    },
    [addonGroups]
  )

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return
    setStatus('generating')
    setError(null)
    try {
      const expandedFunctions = selectedFunctions.flatMap((f) => {
        if (f.startsWith('addon:')) {
          return addonGroups[f.slice(6)] ?? []
        }
        return [f]
      })
      const result = await generateAgent.mutateAsync({
        prompt: prompt.trim(),
        agentName: name.trim() || undefined,
        functionFilter:
          expandedFunctions.length > 0 ? expandedFunctions : undefined,
        allowSubAgents,
      })
      setRunId(result.runId)
      setTimeout(() => {
        progressRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (e: unknown) {
      setStatus('failed')
      setError(
        e instanceof Error ? e.message : 'Failed to start agent generation'
      )
    }
  }, [prompt, name, selectedFunctions, addonGroups, generateAgent, allowSubAgents])

  const handleRetry = useCallback(() => {
    setStatus('idle')
    setRunId(null)
    setError(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (status === 'idle' && prompt.trim()) {
          handleGenerate()
        }
      }
    },
    [status, prompt, handleGenerate]
  )

  const isGenerating = status === 'generating'
  const agentName = run?.output?.agentName as string | undefined
  const toolHint =
    selectedFunctions.length > 0 ? getToolCountHint(expandedFunctionCount) : null

  return (
    <Box style={{ maxWidth: 720, margin: '0 auto' }} py="xl" px="md">
      <Stack gap="xl">
        <Group gap="sm">
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => navigate('/agents')}
            c="dimmed"
          >
            Agents
          </Button>
          <Text size="xl" fw={600}>
            / New Agent
          </Text>
        </Group>

        <TextInput
          label="Agent name (optional)"
          description="Leave empty and AI will name it for you"
          placeholder="e.g. orderAssistant"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          size="sm"
          readOnly={isGenerating}
        />

        <Textarea
          label="Describe what your agent should do"
          placeholder="e.g., An agent that helps users manage their todos, can create, update, and delete tasks, and sends email reminders for overdue items"
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          minRows={5}
          maxRows={12}
          autosize
          size="md"
          readOnly={isGenerating}
          styles={isGenerating ? { input: { opacity: 0.7 } } : undefined}
        />

        <Stack gap="xs">
          <MultiSelect
            label="Tools / Functions (optional)"
            data={functionOptions}
            value={selectedFunctions}
            onChange={handleFunctionChange}
            searchable
            clearable
            size="xs"
            placeholder="All functions — select to limit"
            disabled={isGenerating}
          />
          {toolHint && (
            <Text size="xs" c={toolHint.color}>
              {expandedFunctionCount} tools selected — {toolHint.message}
            </Text>
          )}
        </Stack>

        <Switch
          label="Allow sub-agent delegation"
          description="The agent can delegate tasks to other existing agents"
          checked={allowSubAgents}
          onChange={(e) => setAllowSubAgents(e.currentTarget.checked)}
          disabled={isGenerating}
        />

        <Group justify="flex-end">
          <Text size="xs" c="dimmed">
            {'\u2318'}+Enter to generate
          </Text>
        </Group>

        <Button
          size="lg"
          fullWidth
          leftSection={
            status === 'failed' ? (
              <RotateCcw size={18} />
            ) : (
              <Sparkles size={18} />
            )
          }
          onClick={status === 'failed' ? handleRetry : handleGenerate}
          loading={isGenerating}
          disabled={!prompt.trim() && status !== 'failed'}
          loaderProps={{ type: 'dots' }}
        >
          {status === 'failed'
            ? 'Edit & Retry'
            : isGenerating
              ? 'Generating...'
              : 'Generate Agent'}
        </Button>

        {((steps && steps.length > 0) || isGenerating) && (
          <div ref={progressRef}>
            <GenerationTimeline steps={steps ?? []} />
          </div>
        )}

        {status === 'success' && agentName && (
          <Alert
            color="teal"
            variant="light"
            icon={<CheckCircle size={16} />}
            title="Agent created"
          >
            <Stack gap="xs">
              <Text size="sm">
                Agent <strong>{agentName}</strong> generated successfully.
              </Text>
              <Group gap="sm">
                <Button
                  size="xs"
                  onClick={() =>
                    navigate(
                      `/agents?id=${encodeURIComponent(agentName)}`
                    )
                  }
                >
                  View Agent
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    setStatus('idle')
                    setRunId(null)
                    setPrompt('')
                    setName('')
                    setSelectedFunctions([])
                    setAllowSubAgents(false)
                  }}
                >
                  Create Another
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        {status === 'failed' && error && (
          <Alert
            color="red"
            variant="light"
            icon={<AlertTriangle size={16} />}
            title="Generation failed"
          >
            <Text size="sm">{error}</Text>
          </Alert>
        )}
      </Stack>
    </Box>
  )
}
