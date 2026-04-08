import React, { useState, useMemo } from 'react'
import {
  Stack,
  Text,
  Button,
  Group,
  Paper,
  Box,
  Spoiler,
  Alert,
  Center,
  Transition,
} from '@mantine/core'
import {
  Sparkles,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Plus,
} from 'lucide-react'
import { GenerationTimeline } from '@/components/workflow/GenerationTimeline'
import type { WorkflowStepData } from '@/hooks/useWorkflowRuns'

type GenerationStatus = 'generating' | 'success' | 'failed'

interface GenerationScreenProps {
  type: 'workflow' | 'agent'
  prompt: string
  status: GenerationStatus
  steps: WorkflowStepData[]
  resultName?: string
  description?: string
  error?: string | null
  onViewResult: () => void
  onRetry: () => void
  onCreateAnother: () => void
  onCancel: () => void
}

export const GenerationScreen: React.FunctionComponent<
  GenerationScreenProps
> = ({
  type,
  prompt,
  status,
  steps,
  resultName,
  description,
  error,
  onViewResult,
  onRetry,
  onCreateAnother,
  onCancel,
}) => {
  const [mounted] = useState(true)
  const label = type === 'workflow' ? 'Workflow' : 'Agent'

  const resolvedDescription = useMemo(() => {
    if (description) return description
    const summariseStep = steps.find(
      (s) => s.stepName === 'Summarise prompt' && (s.status === 'completed' || s.status === 'succeeded')
    )
    return (summariseStep?.result as any)?.summary as string | undefined
  }, [description, steps])

  return (
    <Transition mounted={mounted} transition="fade" duration={300}>
      {(transitionStyles) => (
        <Box
          style={{
            ...transitionStyles,
            maxWidth: 600,
            margin: '0 auto',
            minHeight: 'calc(100vh - 200px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '8vh',
          }}
          px="md"
        >
          <Stack gap="xl" w="100%">
            {status === 'generating' && (
              <>
                <Center>
                  <Stack gap="xs" align="center">
                    <Sparkles size={32} style={{ opacity: 0.6 }} />
                    <Text size="xl" fw={600}>
                      Generating {label}...
                    </Text>
                  </Stack>
                </Center>

                {resolvedDescription && (
                  <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-dark-7)">
                    <Spoiler maxHeight={60} showLabel="Show full prompt" hideLabel="Hide full prompt">
                      <Text size="sm" mb="xs">
                        {resolvedDescription}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                        {prompt}
                      </Text>
                    </Spoiler>
                  </Paper>
                )}

                <GenerationTimeline steps={steps} />

                <Center>
                  <Button
                    variant="subtle"
                    size="sm"
                    c="dimmed"
                    leftSection={<ArrowLeft size={14} />}
                    onClick={onCancel}
                  >
                    Cancel
                  </Button>
                </Center>
              </>
            )}

            {status === 'success' && (
              <>
                <Center>
                  <Stack gap="xs" align="center">
                    <CheckCircle size={40} color="var(--mantine-color-teal-5)" />
                    <Text size="xl" fw={600}>
                      {label} Created
                    </Text>
                    {resultName && (
                      <Text size="lg" c="dimmed">
                        {resultName}
                      </Text>
                    )}
                    {resolvedDescription && (
                      <Text size="sm" c="dimmed" ta="center" maw={400}>
                        {resolvedDescription}
                      </Text>
                    )}
                  </Stack>
                </Center>

                {steps.length > 0 && <GenerationTimeline steps={steps} />}

                <Group justify="center" gap="md">
                  <Button
                    size="md"
                    leftSection={<ExternalLink size={16} />}
                    onClick={onViewResult}
                  >
                    View {label}
                  </Button>
                  <Button
                    size="md"
                    variant="light"
                    leftSection={<Plus size={16} />}
                    onClick={onCreateAnother}
                  >
                    Create Another
                  </Button>
                </Group>
              </>
            )}

            {status === 'failed' && (
              <>
                <Center>
                  <Stack gap="xs" align="center">
                    <AlertTriangle size={40} color="var(--mantine-color-red-5)" />
                    <Text size="xl" fw={600}>
                      Generation Failed
                    </Text>
                  </Stack>
                </Center>

                {error && (
                  <Alert color="red" variant="light">
                    <Text size="sm">{error}</Text>
                  </Alert>
                )}

                {steps.length > 0 && <GenerationTimeline steps={steps} />}

                <Group justify="center" gap="md">
                  <Button
                    size="md"
                    leftSection={<ArrowLeft size={16} />}
                    onClick={onRetry}
                  >
                    Edit & Retry
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Box>
      )}
    </Transition>
  )
}
