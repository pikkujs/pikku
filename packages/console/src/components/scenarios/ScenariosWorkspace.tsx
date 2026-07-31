import React, { useState } from 'react'
import { Group, TextInput, Center, Loader, Text } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { FeatureNavigator } from './FeatureNavigator'
import { FeatureDocument } from './FeatureDocument'
import { TagFilter } from './TagFilter'
import { WorkflowProvider } from '../../context/WorkflowContext'
import { usePanelContext } from '../../context/PanelContext'
import { useScenariosBrowse } from '../../hooks/useScenariosBrowse'
import type { ScenariosBrowse } from '../../hooks/useScenariosBrowse'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'

export interface ScenariosWorkspaceProps {
  /** Browse state owned by the host (see `useScenariosBrowse`). Supplying it
   *  means the host mounts the feature rail itself, so this drops its own. */
  browse?: ScenariosBrowse
}

/**
 * The scenarios reading surface: a feature list, the selected feature rendered
 * as prose, and the step/persona details it opens. Lives below
 * `ConsoleSurface` because it reads the panel context that mounts there.
 */
export const ScenariosWorkspace: React.FC<ScenariosWorkspaceProps> = ({
  browse: hostBrowse,
}) => {
  const [stepWorkflow, setStepWorkflow] = useState<unknown>()
  const { personas } = useScenarioPersonaEntries()
  const { openWorkflowStep, openPersona } = usePanelContext()

  // Always mounted so the hook order never depends on the prop; the host's
  // state wins when there is one, and the two share one query cache.
  const ownBrowse = useScenariosBrowse()
  const browse = hostBrowse ?? ownBrowse
  const {
    features,
    tags,
    selectedTags,
    setSelectedTags,
    searchQuery,
    setSearchQuery,
    setSelectedId,
    selected,
    loading,
  } = browse

  /**
   * A scenario is read where it is declared, so following one from a persona
   * opens the feature it belongs to and scrolls its section into view rather
   * than navigating to a page of its own.
   */
  const revealScenario = (name: string) => {
    const owner = features.find((feature) =>
      feature.scenarios.some((entry) => entry.scenario.name === name)
    )
    if (owner) setSelectedId(owner.id)
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-testid="scenario-section-${name}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  /** A persona opens in the panel, beside the feature that cast them. */
  const showPersona = (key: string) => {
    const persona = personas.find((entry) => entry.key === key)
    if (persona) {
      openPersona(key, persona.name, {
        persona,
        onOpenScenario: revealScenario,
      })
    }
  }

  return (
    /* the provider sits above the panel so a step's details can read its own
       scenario's workflow meta, not just the document's */
    <WorkflowProvider workflow={stepWorkflow}>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.nav_scenarios()}
            description={m.scenarios_page_description()}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="wrap">
                <TextInput
                  placeholder={m.scenarios_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 260 }}
                />
                <TagFilter
                  tags={tags}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                />
              </Group>
            }
          />
        }
        leftDrawer={
          loading || hostBrowse ? null : (
            <FeatureNavigator
              features={features}
              selectedId={selected?.id}
              onSelect={setSelectedId}
            />
          )
        }
        emptyPanelMessage={m.scenarios_select_step()}
        hidePanel={loading}
      >
        {loading ? (
          <Center style={{ flex: 1 }}>
            <Loader />
          </Center>
        ) : selected ? (
          <FeatureDocument
            feature={selected}
            onOpenPersona={showPersona}
            onSelectStep={(workflow, stepId, stepType, metadata) => {
              setStepWorkflow(workflow)
              openWorkflowStep(stepId, stepType, { ...metadata, stepType })
            }}
          />
        ) : (
          <Center p="xl">
            <Text size="sm" c="dimmed">
              {m.scenarios_select_feature()}
            </Text>
          </Center>
        )}
      </ResizablePanelLayout>
    </WorkflowProvider>
  )
}
