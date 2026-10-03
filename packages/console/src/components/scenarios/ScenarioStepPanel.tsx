import React from 'react'
import { Anchor, Group, Stack, Tabs, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PikkuBadge } from '../ui/PikkuBadge'
import { SectionLabel } from '../ui/SectionLabel'
import {
  WorkflowStepInput,
  WorkflowStepOutput,
  WorkflowStepConfiguration,
} from '../project/panels/WorkflowStepPanels'
import { ScenarioStepCode } from './ScenarioStepCode'
import {
  useWorkflowContextSafe,
  useWorkflowNode,
  WorkflowProvider,
} from '../../context/WorkflowContext'
import { usePanelContext } from '../../context/PanelContext'

const PHASE_LABEL: Record<string, () => string> = {
  given: () => m.scenarios_phase_given(),
  when: () => m.scenarios_phase_when(),
  then: () => m.scenarios_phase_then(),
  step: () => m.scenarios_phase_step(),
}

type ScenarioStepPanelProps = {
  stepId: string
  metadata: {
    phase?: string
    actor?: string
    actorName?: string
    stepName?: string
    workflow?: unknown
  }
}

/**
 * A scenario step read as a step: the sentence it was written as, the phase it
 * runs in and the actor it runs as — with the scenario step behind it named,
 * rather than the generic `rpc` a workflow node would show.
 *
 * The workflow meta travels on the panel data rather than being read off an
 * ambient provider, because a host mounts the panel container wherever it
 * likes — the Fabric console docks it on the end edge, a sibling of the
 * surface that opened it, so that surface's provider is not above this.
 */
export const ScenarioStepPanel: React.FC<ScenarioStepPanelProps> = ({
  stepId,
  metadata,
}) => {
  const ambient = useWorkflowContextSafe()
  return (
    <WorkflowProvider workflow={metadata.workflow ?? ambient?.workflow}>
      <ScenarioStepBody stepId={stepId} metadata={metadata} />
    </WorkflowProvider>
  )
}

const ScenarioStepBody: React.FC<ScenarioStepPanelProps> = ({
  stepId,
  metadata,
}) => {
  const node = useWorkflowNode(stepId)
  const { openFunction } = usePanelContext()
  const phase = metadata.phase ?? 'step'
  const rpcName = node?.rpcName as string | undefined

  return (
    <Stack gap="md">
      <Stack gap={8} px="md">
        <Group gap="xs">
          <PikkuBadge
            type="label"
            color="gray"
            data-testid="scenario-step-phase"
          >
            {asI18n(PHASE_LABEL[phase]?.() ?? phase)}
          </PikkuBadge>
          {metadata.actor && (
            <PikkuBadge
              type="label"
              color="cyan"
              data-testid="scenario-step-actor"
            >
              {asI18n(metadata.actorName ?? metadata.actor)}
            </PikkuBadge>
          )}
        </Group>
        <Text size="md" fw={600} style={{ lineHeight: 1.35 }}>
          {asI18n(metadata.stepName ?? node?.stepName ?? stepId)}
        </Text>
      </Stack>

      <Tabs defaultValue="details">
        <Tabs.List px="md">
          <Tabs.Tab value="details" data-testid="scenario-step-tab-details">
            {m.scenarios_step_tab_details()}
          </Tabs.Tab>
          {rpcName && (
            <Tabs.Tab value="code" data-testid="scenario-step-tab-code">
              {m.scenarios_step_tab_code()}
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="details" pt="md" px="md">
          <Stack gap="xl">
            {rpcName && (
              <Stack gap={6}>
                <SectionLabel>{m.scenarios_step_definition()}</SectionLabel>
                <Anchor
                  component="span"
                  ff="monospace"
                  size="sm"
                  data-testid="scenario-step-rpc"
                  onClick={() => openFunction(rpcName)}
                  style={{ cursor: 'pointer' }}
                >
                  {asI18n(rpcName)}
                </Anchor>
              </Stack>
            )}
            <WorkflowStepInput stepId={stepId} />
            <WorkflowStepOutput stepId={stepId} />
            <WorkflowStepConfiguration stepId={stepId} />
          </Stack>
        </Tabs.Panel>

        {rpcName && (
          <Tabs.Panel value="code" pt="md" px="md">
            <ScenarioStepCode rpcName={rpcName} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  )
}
