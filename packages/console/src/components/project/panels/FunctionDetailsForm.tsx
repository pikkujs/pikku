import React, { useState } from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Loader,
  Center,
  ActionIcon,
  Badge,
  Divider,
  Paper,
  Progress,
  Tabs,
} from '@mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'
import { FunctionSquare, Pencil } from 'lucide-react'
import { useFunctionMeta, useSchema } from '../../../hooks/useWirings'
import { useFunctionSource } from '../../../hooks/useCodeEdit'
import { SchemaViewer } from '../../ui/SchemaViewer'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { funcWrapperDefs } from '../../ui/badge-defs'
import { CommonDetails } from './shared/CommonDetails'
import { FunctionEditor } from './FunctionEditor'

interface FunctionDetailsFormProps {
  functionName: string
  metadata?: any
}

export const FunctionConfiguration: React.FC<
  FunctionDetailsFormProps
> = ({ functionName, metadata: passedMetadata }) => {
  const { data: fetchedMeta, isLoading } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}
  const [editing, setEditing] = useState(false)

  if (isLoading && !passedMetadata) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  const canEdit = !!meta.sourceFile && !!meta.exportedName

  if (editing && canEdit) {
    return (
      <FunctionEditor
        functionName={functionName}
        sourceFile={meta.sourceFile}
        exportedName={meta.exportedName}
        onClose={() => setEditing(false)}
      />
    )
  }

  const services = meta.services?.services || []
  const middleware = meta.middleware || []
  const permissions = meta.permissions || []
  const isExposed = meta.expose === true
  const hasAuth = meta.sessionless !== true

  return (
    <Stack gap="lg">
      <Group gap="xs">
        {canEdit && (
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setEditing(true)}
            title="Edit function"
          >
            <Pencil size={14} />
          </ActionIcon>
        )}
      </Group>

      <Group gap="xs">
        {funcWrapperDefs[meta.funcWrapper] && (
          <PikkuBadge type="funcWrapper" value={meta.funcWrapper} />
        )}
        {hasAuth && <PikkuBadge type="flag" flag="auth" />}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
        {isExposed && <PikkuBadge type="flag" flag="exposed" />}
        {meta.internal === true && <PikkuBadge type="flag" flag="internal" />}
      </Group>

      <CommonDetails
        description={meta.description}
        services={services}
        wires={meta.wires}
        middleware={middleware}
        permissions={permissions}
        tags={meta.tags || []}
        errors={meta.errors || []}
        functionName={functionName}
        inputSchemaName={meta.inputSchemaName}
        outputSchemaName={meta.outputSchemaName}
      />
    </Stack>
  )
}

export const FunctionHeader: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}

  return (
    <Box>
      <Group gap="xs">
        <FunctionSquare size={20} />
        <Text size="lg" ff="monospace" fw={600}>
          {functionName}
        </Text>
      </Group>
      <Text size="sm" c="dimmed" mt={4}>
        {meta.summary || 'No summary'}
      </Text>
    </Box>
  )
}

export const FunctionTestsPanel: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  const { data: fetchedMeta, isLoading } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}

  if (isLoading && !passedMetadata) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (!meta.tests) {
    return <Text c="dimmed">No test data yet.</Text>
  }

  return (
    <FunctionTestsSection
      tests={meta.tests}
      sourceFile={meta.sourceFile}
      exportedName={meta.exportedName}
    />
  )
}

export const FunctionTabbedPanel: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata,
}) => {
  return (
    <Stack gap="md">
      <Box px="md">
        <FunctionHeader functionName={functionName} metadata={metadata} />
      </Box>
      <Tabs defaultValue="overview">
        <Tabs.List grow>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="tests">Tests</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md" px="md">
          <FunctionConfiguration
            functionName={functionName}
            metadata={metadata}
          />
        </Tabs.Panel>
        <Tabs.Panel value="tests" pt="md" px="md">
          <FunctionTestsPanel functionName={functionName} metadata={metadata} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function FunctionTestsSection({
  tests,
  sourceFile,
  exportedName,
}: {
  tests: any
  sourceFile?: string
  exportedName?: string
}) {
  const missedLines = Array.isArray(tests.missedLines) ? tests.missedLines : []
  const { data: source, isLoading: isSourceLoading } = useFunctionSource(
    sourceFile,
    exportedName,
    !!sourceFile && !!exportedName,
  )

  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="md" bg="rgba(255,255,255,0.02)">
        <Stack gap="md">
          <Group gap="sm" wrap="wrap">
            <Badge
              variant="light"
              color={
                tests.status === 'covered'
                  ? 'green'
                  : tests.status === 'partial'
                    ? 'yellow'
                    : tests.status === 'uncovered'
                      ? 'red'
                      : 'gray'
              }
            >
              {tests.status === 'covered'
                ? `${tests.coveredLines}/${tests.totalLines}`
                : `${Math.round((tests.ratio ?? 0) * 100)}%`}
            </Badge>
            <Text size="sm" c="dimmed">
              {tests.scenarios?.length === 0
                ? 'No linked scenarios yet'
                : `${tests.scenarios?.length ?? 0} linked scenarios`}
            </Text>
          </Group>
          <Progress
            value={(tests.ratio ?? 0) * 100}
            color={
              tests.status === 'covered'
                ? 'green'
                : tests.status === 'partial'
                  ? 'yellow'
                  : tests.status === 'uncovered'
                    ? 'red'
                    : 'gray'
            }
            radius="xl"
          />
        </Stack>
      </Paper>

      <Stack gap="sm">
        <Group gap="sm" align="center">
          <Text
            ff="monospace"
            size="xs"
            fw={700}
            tt="uppercase"
            lts="0.12em"
            c="dimmed"
          >
            Scenarios
          </Text>
          <Text ff="monospace" size="xs" c="dimmed">
            {tests.scenarios?.length ?? 0} linked
          </Text>
        </Group>
        {!tests.scenarios || tests.scenarios.length === 0 ? (
          <Paper withBorder radius="lg" p="md" bg="rgba(248,113,113,0.08)">
            <Text size="sm" c="dimmed">
              No scenarios are linked to this function yet.
            </Text>
          </Paper>
        ) : (
          <Paper withBorder radius="lg" p={0} bg="rgba(255,255,255,0.02)">
            <Stack gap={0}>
              {tests.scenarios.map((scenario: any, index: number) => (
                <Box key={`${scenario.scenarioName}-${index}`} p="md">
                  <Stack gap={8}>
                    <Group gap="xs" wrap="wrap">
                      <Badge
                        variant="light"
                        color={scenario.status === 'fail' ? 'red' : 'green'}
                      >
                        {scenario.status === 'fail' ? 'Failing' : 'Passing'}
                      </Badge>
                      <Text ff="monospace" size="sm" fw={600} c="white">
                        {scenario.scenarioName}
                      </Text>
                      {scenario.duration && (
                        <Badge variant="light" color="gray">
                          {scenario.duration}
                        </Badge>
                      )}
                    </Group>
                    {scenario.featureName && (
                      <Text size="sm" c="dimmed">
                        {scenario.featureName}
                      </Text>
                    )}
                    <Stack gap={2} pl={8}>
                      {(scenario.steps ?? []).map(
                        (step: string, stepIndex: number) => (
                          <HighlightedStep key={stepIndex} step={step} />
                        )
                      )}
                    </Stack>
                  </Stack>
                  {index < tests.scenarios.length - 1 && (
                    <Divider my="md" color="rgba(255,255,255,0.06)" />
                  )}
                </Box>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>

      <Stack gap="sm">
        <Group gap="sm" align="center">
          <Text
            ff="monospace"
            size="xs"
            fw={700}
            tt="uppercase"
            lts="0.12em"
            c="dimmed"
          >
            Coverage Gaps
          </Text>
          <Text ff="monospace" size="xs" c="dimmed">
            {missedLines.length === 0 ? 'clean' : `${missedLines.length} uncovered`}
          </Text>
        </Group>
        {missedLines.length === 0 ? (
          <Paper withBorder radius="lg" p="md" bg="rgba(52,211,153,0.08)">
            <Text size="sm" c="dimmed">
              All executable lines are covered for this function.
            </Text>
          </Paper>
        ) : isSourceLoading ? (
          <Center py="md">
            <Loader size="sm" />
          </Center>
        ) : source &&
          typeof source === 'object' &&
          'body' in source &&
          typeof (source as { body?: unknown }).body === 'string' &&
          'bodyStartLine' in source &&
          typeof (source as { bodyStartLine?: unknown }).bodyStartLine === 'number' ? (
          <Paper
            withBorder
            radius="lg"
            p={0}
            bg="rgba(255,255,255,0.02)"
            style={{ overflow: 'hidden' }}
          >
            <FunctionCoverageCode
              body={(source as { body: string }).body}
              bodyStartLine={(source as { bodyStartLine: number }).bodyStartLine}
              missedLines={missedLines}
            />
          </Paper>
        ) : (
          <Paper withBorder radius="lg" p="md" bg="rgba(255,255,255,0.02)">
            <Stack gap={8}>
              {missedLines.map((line: number) => (
                <Group
                  key={line}
                  gap="sm"
                  align="center"
                  wrap="nowrap"
                  style={{
                    borderLeft: '2px solid var(--mantine-color-red-6)',
                    background: 'rgba(248,113,113,0.08)',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  <Text ff="monospace" size="xs" c="dimmed" w={42}>
                    {line}
                  </Text>
                  <Text ff="monospace" size="sm" c="white">
                    branch on line {line} is still not exercised
                  </Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Stack>
  )
}

function FunctionCoverageCode({
  body,
  bodyStartLine,
  missedLines,
}: {
  body: string
  bodyStartLine: number
  missedLines: number[]
}) {
  const missed = new Set(missedLines)
  const lines = body.replace(/\n$/, '').split('\n')

  return (
    <Box ff="monospace" fz="sm">
      {lines.map((line, index) => {
        const lineNumber = bodyStartLine + index
        const isMissed = missed.has(lineNumber)
        return (
          <Group
            key={lineNumber}
            gap={0}
            align="stretch"
            wrap="nowrap"
            style={{
              borderLeft: isMissed
                ? '2px solid var(--mantine-color-red-6)'
                : '2px solid transparent',
              background: isMissed ? 'rgba(248,113,113,0.08)' : 'transparent',
            }}
          >
            <Text
              ff="monospace"
              size="xs"
              c="dimmed"
              px="sm"
              py={6}
              style={{
                width: 64,
                textAlign: 'right',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                userSelect: 'none',
              }}
            >
              {lineNumber}
            </Text>
            <Text
              ff="monospace"
              size="sm"
              c="white"
              px="sm"
              py={6}
              style={{
                whiteSpace: 'pre-wrap',
                flex: 1,
              }}
            >
              {line || ' '}
            </Text>
          </Group>
        )
      })}
    </Box>
  )
}

function HighlightedStep({ step }: { step: string }) {
  const keywordMatch = step.match(/^(Given|When|Then|And)\b/)
  const keyword = keywordMatch?.[1] ?? ''
  const remainder = keyword ? step.slice(keyword.length).trimStart() : step
  const isAnd = keyword === 'And'

  return (
    <Text ff="monospace" size="sm" c="white" pl={isAnd ? 16 : 0}>
      {keyword && (
        <Text component="span" inherit c="var(--mantine-color-violet-4)" fw={600}>
          {keyword}
        </Text>
      )}
      {keyword ? ` ${remainder}` : step}
    </Text>
  )
}

export const FunctionCode: React.FC<
  Pick<FunctionDetailsFormProps, 'functionName'>
> = ({ functionName }) => {
  const exampleCode = `export const ${functionName} = pikkuFunc({
  handler: async (input, { services, session }) => {
    // Function implementation
    return {}
  }
})`

  return <CodeHighlight code={exampleCode} language="typescript" />
}

export const FunctionInput: React.FC<
  FunctionDetailsFormProps
> = ({ functionName, metadata = {} }) => {
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.inputSchemaName ? metadata : fetchedMeta || {}
  const inputSchemaName = meta?.inputSchemaName
  const { data: schema, isLoading, error } = useSchema(inputSchemaName)

  if (!inputSchemaName) {
    return <Text c="dimmed">No input schema defined</Text>
  }

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">Error loading schema: {error.message}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">Schema not found: {inputSchemaName}</Text>
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionOutput: React.FC<
  FunctionDetailsFormProps
> = ({ functionName, metadata = {} }) => {
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.outputSchemaName ? metadata : fetchedMeta || {}
  const outputSchemaName = meta?.outputSchemaName
  const { data: schema, isLoading, error } = useSchema(outputSchemaName)

  if (!outputSchemaName) {
    return <Text c="dimmed">No output schema defined</Text>
  }

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">Error loading schema: {error.message}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">Schema not found: {outputSchemaName}</Text>
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionDetailsForm = FunctionConfiguration
