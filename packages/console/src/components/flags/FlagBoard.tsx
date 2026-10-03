import { useMemo } from 'react'
import { Alert, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ToggleLeft } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { SectionCard } from '../ui/SectionCard'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { isForbiddenScopeError } from '../scopes/scope-error'
import { FlagDetailPanel } from './FlagDetailPanel'
import { FlagRow, LANE_LOOK } from './FlagRow'
import {
  groupFlagsByLane,
  type FlagBoardRow,
  type FlagLaneId,
} from './flag-lanes'
import { useFeatureFlags } from '../../hooks/useFeatureFlags'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'

const DOCS_HREF = 'https://pikku.dev/docs/console/features#feature-flags'

const LIST_ORDER: readonly FlagLaneId[] = ['rolling', 'live', 'dark']

type FlagBoardProps = {
  search: string
  selectedName: string | null
  panelOpen: boolean
  onOpenFlag: (flag: FlagBoardRow) => void
  onClosePanel: () => void
}

const LaneGroup: React.FC<{
  lane: FlagLaneId
  flags: FlagBoardRow[]
  selectedName: string | null
  onOpen: (flag: FlagBoardRow) => void
  heading?: boolean
}> = ({ lane, flags, selectedName, onOpen, heading = true }) => (
  <Stack gap="sm" data-testid="flag-lane" data-lane={lane}>
    {heading && (
      <Group gap={8} align="baseline">
        <Text size="sm" fw={600}>
          {LANE_LOOK[lane].title()}
        </Text>
        <Text size="xs" c="dimmed">
          {flags.length === 0 ? m.flags_lane_empty() : LANE_LOOK[lane].hint()}
        </Text>
      </Group>
    )}
    {flags.map((flag) => (
      <FlagRow
        key={flag.name}
        flag={flag}
        selected={flag.name === selectedName}
        onOpen={onOpen}
      />
    ))}
  </Stack>
)

/** Every switch the app declares, grouped by how far it has been turned on, with one open beside the list. */
export const FlagBoard: React.FC<FlagBoardProps> = ({
  search,
  selectedName,
  panelOpen,
  onOpenFlag,
  onClosePanel,
}) => {
  const flagsQuery = useFeatureFlags()
  const flags = flagsQuery.data?.flags ?? []
  const writable = flagsQuery.data?.writable ?? false
  const selected = flags.find((flag) => flag.name === selectedName) ?? null

  const lanes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matching = query
      ? flags.filter(
          (flag) =>
            flag.name.toLowerCase().includes(query) ||
            (flag.description ?? '').toLowerCase().includes(query)
        )
      : flags
    return groupFlagsByLane(matching)
  }, [flags, search])

  if (flagsQuery.error) {
    if (isForbiddenScopeError(flagsQuery.error)) {
      return (
        <Alert
          color="yellow"
          title={m.flags_forbidden_title()}
          data-testid="flags-forbidden"
        >
          {m.flags_forbidden_body()}
        </Alert>
      )
    }
    return (
      <Alert
        color="red"
        title={m.flags_load_error()}
        styles={{ message: { overflowWrap: 'anywhere' } }}
        data-testid="flags-load-error"
      >
        {flagsQuery.error instanceof Error
          ? asI18n(flagsQuery.error.message)
          : null}
      </Alert>
    )
  }

  if (flagsQuery.isLoading) {
    return <ConsoleLoading />
  }

  if (flags.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={ToggleLeft}
        title={m.flags_empty_title()}
        description={m.flags_empty_body()}
        docsHref={DOCS_HREF}
      />
    )
  }

  const attention = lanes.attention.length
  const openName = panelOpen ? selectedName : null

  return (
    <>
      <Stack gap="lg" data-testid="flag-board" data-help="board">
        {attention > 0 && (
          <SectionCard
            testId="flags-attention"
            title={m.flags_attention_title()}
            blurb={m.flags_attention_blurb()}
            right={
              <StatusBadge tone="warn">
                {plural(
                  attention,
                  m.flags_state_attention_one,
                  m.flags_state_attention
                )}
              </StatusBadge>
            }
          >
            <Stack gap="sm" mt="md">
              <LaneGroup
                lane="attention"
                heading={false}
                flags={lanes.attention}
                selectedName={openName}
                onOpen={onOpenFlag}
              />
            </Stack>
          </SectionCard>
        )}
        <SectionCard
          testId="flags-list"
          title={m.flags_list_title()}
          blurb={m.flags_list_blurb()}
          right={
            attention === 0 && (
              <StatusBadge tone="good">{m.flags_state_ok()}</StatusBadge>
            )
          }
          footer={
            <ForDevelopers
              attached
              testId="flags-dev"
              label={m.dev_label()}
              hint={m.flags_dev_hint()}
            >
              <Stack gap={2}>
                {flags.map((flag) => (
                  <Text
                    key={flag.name}
                    size="xs"
                    c="dimmed"
                    ff="monospace"
                    style={{ wordBreak: 'break-all' }}
                  >
                    {asI18n(
                      flag.anyOf && flag.anyOf.length > 0
                        ? `${flag.name} · ${flag.anyOf.join(', ')}`
                        : flag.name
                    )}
                  </Text>
                ))}
              </Stack>
            </ForDevelopers>
          }
        >
          <Stack gap="lg" mt="md">
            {!writable && (
              <Alert
                color="blue"
                title={m.flags_read_only_title()}
                data-testid="flags-read-only"
              >
                {m.flags_read_only_body()}
              </Alert>
            )}
            {LIST_ORDER.map((lane) => (
              <LaneGroup
                key={lane}
                lane={lane}
                flags={lanes[lane]}
                selectedName={openName}
                onOpen={onOpenFlag}
              />
            ))}
            {attention === 0 && (
              <LaneGroup
                lane="attention"
                flags={[]}
                selectedName={null}
                onOpen={onOpenFlag}
              />
            )}
          </Stack>
        </SectionCard>
      </Stack>
      <FlagDetailPanel
        flag={selected}
        opened={panelOpen}
        writable={writable}
        onClose={onClosePanel}
      />
    </>
  )
}
