import React from 'react'
import { Card, Stack, Text } from '@pikku/mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'
import { m } from '@/i18n/messages'
import { SectionLabel } from '../ui/SectionLabel'
import { useFunctionMeta } from '../../hooks/useWirings'
import { useFunctionSource } from '../../hooks/useCodeEdit'

type ScenarioStepCodeProps = {
  /** The scenario step the sentence runs — a function id like `seesTestId`. */
  rpcName: string
}

/**
 * The body of the scenario step a sentence runs, read the same way the
 * function editor reads a function's source.
 */
export const ScenarioStepCode: React.FC<ScenarioStepCodeProps> = ({
  rpcName,
}) => {
  const { data: meta } = useFunctionMeta(rpcName)
  const sourceFile = (meta as { sourceFile?: string } | null)?.sourceFile
  const exportedName = (meta as { exportedName?: string } | null)?.exportedName
  const { data: source, isLoading } = useFunctionSource(
    sourceFile,
    exportedName,
    true
  )

  if (!sourceFile || !exportedName) return null

  return (
    <Stack gap={6}>
      <SectionLabel>{m.scenarios_step_code()}</SectionLabel>
      <Card withBorder radius="md" padding={0} data-testid="scenario-step-code">
        {source?.body ? (
          <CodeHighlight code={source.body} language="typescript" />
        ) : (
          <Text size="xs" c="dimmed" p="md">
            {isLoading
              ? m.scenarios_step_code_loading()
              : m.scenarios_step_code_unavailable()}
          </Text>
        )}
      </Card>
    </Stack>
  )
}
