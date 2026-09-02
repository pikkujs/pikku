import {
  AppWindow,
  Database,
  FlaskConical,
  ListChecks,
  Lock,
  Users,
  Zap,
} from 'lucide-react'
import { Badge, Code, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  planCoverage,
  slotItems,
  type Plan,
  type PlanChecklistItem,
} from '@/lib/plan'
import type { CardSection } from '../ui/SectionsCard'
import { PlanField } from './PlanField'
import { PlanItemCard } from './PlanItemCard'
import { PlanNamedCard } from './PlanNamedCard'
import { PlanNotApplicable } from './PlanNotApplicable'
import { PlanSlotBody } from './PlanSlotBody'
import { PlanSlotProgress } from './PlanSlotProgress'

const CLASSIFICATION_COLOR: Record<string, string> = {
  public: 'gray',
  internal: 'blue',
  personal: 'orange',
  sensitive: 'red',
}

const SCENARIO_TITLE = {
  backend: m.knowledge_plan_section_scenarios_backend,
  browser: m.knowledge_plan_section_scenarios_browser,
  permission: m.knowledge_plan_section_scenarios_permission,
}

/**
 * The plan as the sections a reader opens one at a time.
 *
 * A section carries a progress readout only where the meta has something to say
 * about it — functions, scopes and scenarios are names codegen either emitted or
 * did not. The model, ui and roles slots have no counterpart in generated meta, so
 * they show what was planned and claim nothing about what exists; a weaker
 * file-exists check there would only produce a second opinion to argue with.
 */
export const planSections = (
  plan: Plan,
  checklist: PlanChecklistItem[]
): CardSection[] => {
  const functions = slotItems(plan.functions)
  const scopes = slotItems(plan.scopes)
  const functionCoverage = planCoverage(
    checklist,
    functions.map((item) => `function:${item.name}`)
  )
  const scopeCoverage = planCoverage(
    checklist,
    scopes.map((item) => `scope:${item.name}`)
  )

  const sections: CardSection[] = [
    {
      key: 'covers',
      title: m.knowledge_plan_section_covers(),
      icon: ListChecks,
      count: plan.covers.length,
      body: (
        <PlanSlotBody
          slot={{
            kind: 'built',
            description: m.knowledge_plan_covers_hint(),
            items: plan.covers,
          }}
          render={(covers) => (
            <PlanItemCard key={covers.note}>
              <Group gap={8} wrap="nowrap" align="center">
                <Text size="xs" ff="monospace" style={{ flex: 1, minWidth: 0 }}>
                  {asI18n(covers.note)}
                </Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={covers.complete ? 'green' : 'gray'}
                >
                  {covers.complete
                    ? m.knowledge_plan_covers_complete()
                    : m.knowledge_plan_covers_partial()}
                </Badge>
              </Group>
            </PlanItemCard>
          )}
        />
      ),
    },
    {
      key: 'model',
      title: m.knowledge_plan_section_model(),
      icon: Database,
      count: slotItems(plan.model).length,
      right: plan.model.kind === 'n/a' ? <PlanNotApplicable /> : undefined,
      body: (
        <PlanSlotBody
          slot={plan.model}
          render={(item) => (
            <PlanItemCard key={item.table}>
              <Text size="xs" fw={600} ff="monospace">
                {asI18n(item.table)}
              </Text>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                {asI18n(item.description)}
              </Text>
              <Stack gap={3}>
                {item.fields.map((field) => (
                  <Group
                    key={field.name}
                    gap={6}
                    wrap="nowrap"
                    align="baseline"
                  >
                    <Text size="xs" ff="monospace" style={{ flexShrink: 0 }}>
                      {asI18n(field.name)}
                    </Text>
                    <Text
                      size="xs"
                      c="dimmed"
                      ff="monospace"
                      style={{ flexShrink: 0 }}
                    >
                      {asI18n(field.type)}
                    </Text>
                    <Badge
                      size="xs"
                      variant="light"
                      color={
                        CLASSIFICATION_COLOR[field.classification] ?? 'gray'
                      }
                    >
                      {asI18n(field.classification)}
                    </Badge>
                  </Group>
                ))}
              </Stack>
              {item.relationships.map((rel) => (
                <PlanField
                  key={rel.column}
                  label={m.knowledge_plan_relationship()}
                >
                  <Text size="xs" ff="monospace">
                    {asI18n(
                      `${rel.column} → ${rel.references} (${rel.onDelete})`
                    )}
                  </Text>
                </PlanField>
              ))}
            </PlanItemCard>
          )}
        />
      ),
    },
    {
      key: 'functions',
      title: m.knowledge_plan_section_functions(),
      icon: Zap,
      count: functions.length,
      right:
        plan.functions.kind === 'n/a' ? (
          <PlanNotApplicable />
        ) : (
          <PlanSlotProgress
            done={functionCoverage.done}
            total={functionCoverage.total}
          />
        ),
      body: (
        <PlanSlotBody
          slot={plan.functions}
          render={(item) => (
            <PlanItemCard key={item.name}>
              <Group gap={8} align="center" wrap="nowrap">
                <Text
                  size="xs"
                  fw={600}
                  ff="monospace"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {asI18n(item.name)}
                </Text>
                <Badge size="xs" variant="default">
                  {m.knowledge_plan_pass({ pass: item.pass })}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                {asI18n(item.description)}
              </Text>
              {item.wire && (
                <PlanField label={m.knowledge_plan_wire()}>
                  <Text size="xs" ff="monospace">
                    {asI18n(
                      item.wire.route
                        ? `${item.wire.transport} ${item.wire.route}`
                        : item.wire.transport
                    )}
                  </Text>
                </PlanField>
              )}
              <PlanField label={m.knowledge_plan_permission()}>
                <Text size="xs">
                  {item.permission
                    ? asI18n(item.permission)
                    : m.knowledge_plan_permission_open()}
                </Text>
              </PlanField>
              {item.scopes.length > 0 && (
                <Group gap={4}>
                  {item.scopes.map((scope) => (
                    <Badge key={scope} size="xs" variant="light" color="gray">
                      {asI18n(scope)}
                    </Badge>
                  ))}
                </Group>
              )}
            </PlanItemCard>
          )}
        />
      ),
    },
    {
      key: 'ui',
      title: m.knowledge_plan_section_ui(),
      icon: AppWindow,
      count: slotItems(plan.ui).length,
      right: plan.ui.kind === 'n/a' ? <PlanNotApplicable /> : undefined,
      body: (
        <PlanSlotBody
          slot={plan.ui}
          render={(item) => (
            <PlanItemCard key={item.route}>
              <Group gap={8} align="center" wrap="nowrap">
                <Text
                  size="xs"
                  fw={600}
                  ff="monospace"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {asI18n(item.route)}
                </Text>
                {item.app && (
                  <Badge size="xs" variant="light">
                    {asI18n(item.app)}
                  </Badge>
                )}
                <Badge size="xs" variant="default">
                  {m.knowledge_plan_pass({ pass: item.pass })}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                {asI18n(item.description)}
              </Text>
            </PlanItemCard>
          )}
        />
      ),
    },
    {
      key: 'roles',
      title: m.knowledge_plan_section_roles(),
      icon: Users,
      count: slotItems(plan.roles).length,
      right: plan.roles.kind === 'n/a' ? <PlanNotApplicable /> : undefined,
      body: (
        <PlanSlotBody
          slot={plan.roles}
          render={(item) => (
            <PlanNamedCard
              key={item.name}
              name={item.name}
              description={item.description}
              app={item.app}
            />
          )}
        />
      ),
    },
    {
      key: 'scopes',
      title: m.knowledge_plan_section_scopes(),
      icon: Lock,
      count: scopes.length,
      right:
        plan.scopes.kind === 'n/a' ? (
          <PlanNotApplicable />
        ) : (
          <PlanSlotProgress
            done={scopeCoverage.done}
            total={scopeCoverage.total}
          />
        ),
      body: (
        <PlanSlotBody
          slot={plan.scopes}
          render={(item) => (
            <PlanNamedCard
              key={item.name}
              name={item.name}
              description={item.description}
            />
          )}
        />
      ),
    },
  ]

  for (const level of ['backend', 'browser', 'permission'] as const) {
    const slot = plan.scenarios[level]
    const items = slotItems(slot)
    const scenarioCoverage = planCoverage(
      checklist,
      items.map((item) => `scenario:${item.name}`)
    )
    sections.push({
      key: `scenarios-${level}`,
      title: SCENARIO_TITLE[level](),
      icon: FlaskConical,
      count: items.length,
      right:
        slot.kind === 'n/a' ? (
          <PlanNotApplicable />
        ) : (
          <PlanSlotProgress
            done={scenarioCoverage.done}
            total={scenarioCoverage.total}
          />
        ),
      body: (
        <PlanSlotBody
          slot={slot}
          render={(item, index) => (
            <PlanItemCard key={item.name ?? `${item.feature}-${index}`}>
              <Text size="xs" fw={600}>
                {asI18n(item.scenario)}
              </Text>
              <Text size="xs" c="dimmed">
                {asI18n(item.feature)}
              </Text>
              {item.name && (
                <Code style={{ fontSize: 11, alignSelf: 'flex-start' }}>
                  {asI18n(item.name)}
                </Code>
              )}
            </PlanItemCard>
          )}
        />
      ),
    })
  }

  return sections
}
