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
} from '@mantine/core'
import {
  Sparkles,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { useNavigate } from '@/router'
import { useGenerateWorkflowGraph } from '@/hooks/useWorkflowEditor'
import { useWorkflowRun, useWorkflowRunSteps } from '@/hooks/useWorkflowRuns'
import { useAddonFunctions } from '@/hooks/useAddonFunctions'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { GenerationTimeline } from '@/components/workflow/GenerationTimeline'

type Status = 'idle' | 'generating' | 'success' | 'failed'

export const WorkflowNewPage: React.FunctionComponent = () => {
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const generateGraph = useGenerateWorkflowGraph()
  const { data: run } = useWorkflowRun(runId)
  const { data: steps } = useWorkflowRunSteps(runId)
  const { meta } = usePikkuMeta()
  const { data: addonFunctions } = useAddonFunctions()

  useEffect(() => {
    if (run?.status === 'completed') {
      setStatus('success')
    } else if (run?.status === 'failed') {
      setStatus('failed')
      setError(run.error?.message || 'Workflow generation failed')
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
      const result = await generateGraph.mutateAsync({
        prompt: prompt.trim(),
        workflowName: name.trim() || undefined,
        functionFilter: expandedFunctions.length > 0 ? expandedFunctions : undefined,
      })
      setRunId(result.runId)
      setTimeout(() => {
        progressRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (e: unknown) {
      setStatus('failed')
      setError(
        e instanceof Error ? e.message : 'Failed to start workflow generation'
      )
    }
  }, [prompt, name, generateGraph])

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
  const workflowName = run?.output?.workflowName as string | undefined

  return (
    <Box style={{ maxWidth: 720, margin: '0 auto' }} py="xl" px="md">
      <Stack gap="xl">
        <Group gap="sm">
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<ArrowLeft size={16} />}
            onClick={() => navigate('/workflow')}
            c="dimmed"
          >
            Workflows
          </Button>
          <Text size="xl" fw={600}>
            / New Workflow
          </Text>
        </Group>

        <TextInput
          label="Workflow name (optional)"
          description="Leave empty and AI will name it for you"
          placeholder="e.g. processOrder"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          size="sm"
          readOnly={isGenerating}
        />

        <Textarea
          label="Describe your workflow"
          placeholder="e.g., When a new todo is created, check if it's high priority, then send an email notification and schedule a reminder"
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

        <MultiSelect
          label="Functions (optional)"
          data={functionOptions}
          value={selectedFunctions}
          onChange={handleFunctionChange}
          searchable
          clearable
          size="xs"
          placeholder="All functions — select to limit"
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
              : 'Generate Workflow'}
        </Button>

        {((steps && steps.length > 0) || isGenerating) && (
          <div ref={progressRef}>
            <GenerationTimeline steps={steps ?? []} />
          </div>
        )}

        {status === 'success' && workflowName && (
          <Alert
            color="teal"
            variant="light"
            icon={<CheckCircle size={16} />}
            title="Workflow created"
          >
            <Stack gap="xs">
              <Text size="sm">
                Workflow <strong>{workflowName}</strong> generated successfully.
              </Text>
              <Group gap="sm">
                <Button
                  size="xs"
                  onClick={() =>
                    navigate(
                      `/workflow?id=${encodeURIComponent(workflowName)}`
                    )
                  }
                >
                  View Workflow
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    setStatus('idle')
                    setRunId(null)
                    setPrompt('')
                    setName('')
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
