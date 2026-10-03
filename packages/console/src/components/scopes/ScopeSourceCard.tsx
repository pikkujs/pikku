import React, { useState } from 'react'
import { Button, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { Role } from '../../hooks/useScopes'
import { SectionCard } from '../ui/SectionCard'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevField, DevFields } from '../ui/DevDetail'
import { ScopeAreaBlock, scopeLabel } from './ScopeAreaBlock'
import { sourcePermissionCount, type ScopeSource } from './scope-sources'

const TITLE: Record<Exclude<ScopeSource['kind'], 'addon'>, () => I18nNode> = {
  app: m.scopes_source_app_title,
  generated: m.scopes_source_generated_title,
  other: m.scopes_source_other_title,
  removed: m.scopes_source_removed_title,
}

const BLURB: Record<
  Exclude<ScopeSource['kind'], 'addon' | 'other'>,
  () => I18nNode
> = {
  app: m.scopes_source_app_blurb,
  generated: m.scopes_source_generated_blurb,
  removed: m.scopes_source_removed_blurb,
}

type ScopeSourceCardProps = {
  source: ScopeSource
  roles?: Role[]
  /** Whether the card starts unfolded. */
  defaultOpen: boolean
  /** Holds the card open — while searching, so every match is on screen. */
  forceOpen: boolean
}

export const ScopeSourceCard: React.FC<ScopeSourceCardProps> = ({
  source,
  roles,
  defaultOpen,
  forceOpen,
}) => {
  const [unfolded, setUnfolded] = useState(defaultOpen)
  const open = forceOpen || unfolded
  const count = sourcePermissionCount(source)
  const loneAddonArea =
    source.kind === 'addon' && source.areas.length === 1
      ? source.areas[0]
      : undefined

  const title =
    source.kind === 'addon'
      ? asI18n(source.displayName ?? source.package)
      : TITLE[source.kind]()
  const blurb =
    source.kind === 'addon'
      ? loneAddonArea?.description
        ? asI18n(loneAddonArea.description)
        : undefined
      : source.kind === 'other'
        ? undefined
        : BLURB[source.kind]()

  return (
    <SectionCard
      testId={`scope-source-${source.key}`}
      title={title}
      subtitle={
        count === 1 ? m.scopes_area_count_one() : m.scopes_area_count({ count })
      }
      blurb={blurb}
      badges={
        source.kind === 'addon' ? (
          <Text size="xs" c="dimmed" ff="monospace">
            {m.scopes_source_addon_from({ package: source.package })}
          </Text>
        ) : undefined
      }
      right={
        !forceOpen ? (
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={
              open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            }
            onClick={() => setUnfolded((value) => !value)}
            data-testid={`scope-source-toggle-${source.key}`}
          >
            {open ? m.scopes_source_hide() : m.scopes_source_show()}
          </Button>
        ) : undefined
      }
      footer={
        open ? (
          <ForDevelopers
            attached
            label={m.scopes_dev_label()}
            hint={m.scopes_dev_hint()}
            testId={`scope-source-developers-${source.key}`}
          >
            <DevFields>
              {source.areas
                .flatMap((area) => area.all)
                .map((scope) => (
                  <DevField
                    key={scope.id}
                    label={scopeLabel(scope)}
                    value={scope.id}
                  >
                    <Group gap="xs" wrap="wrap">
                      <Text size="sm" ff="monospace">
                        {asI18n(scope.id)}
                      </Text>
                      {!scope.declared && (
                        <Text size="xs" c="dimmed">
                          {m.scopes_state_stale()}
                        </Text>
                      )}
                    </Group>
                  </DevField>
                ))}
            </DevFields>
          </ForDevelopers>
        ) : undefined
      }
    >
      {open && (
        <Stack gap="lg" mt="md">
          {source.areas.map((area) => (
            <ScopeAreaBlock
              key={area.id}
              area={area}
              roles={roles}
              showHeading={!loneAddonArea}
            />
          ))}
        </Stack>
      )}
    </SectionCard>
  )
}
