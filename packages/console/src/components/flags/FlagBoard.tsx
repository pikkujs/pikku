import { useMemo } from 'react'
import { Alert, SimpleGrid, Stack } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ToggleLeft } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { isForbiddenScopeError } from '../scopes/scope-error'
import { FlagLaneColumn } from './FlagLaneColumn'
import { FlagDetailPanel } from './FlagDetailPanel'
import {
  FLAG_LANE_ORDER,
  groupFlagsByLane,
  type FlagBoardRow,
} from './flag-lanes'
import { useFeatureFlags } from '../../hooks/useFeatureFlags'
import { m } from '@/i18n/messages'

const DOCS_HREF = 'https://pikku.dev/docs/console/features#feature-flags'

type FlagBoardProps = {
  search: string
  /** The open flag by NAME rather than by row: a switch or a rollout the panel
   *  sets refetches the list, and a row captured at click time would leave the
   *  panel describing the flag as it was before the operator changed it. */
  selectedName: string | null
  panelOpen: boolean
  onOpenFlag: (flag: FlagBoardRow) => void
  onClosePanel: () => void
}

/**
 * The launch board: every declared flag in the lane its rollout has reached,
 * with one flag's controls open beside it.
 */
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
          m="md"
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
        m="md"
        title={m.flags_load_error()}
        // A server's message can be one unbroken token — a schema union listing
        // every name it accepts — and an alert that will not break it runs off
        // the side of the page, taking the part that says what went wrong.
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

  return (
    <>
      <Stack gap="md" p="md" data-testid="flag-board" data-help="board">
        {!writable && (
          <Alert
            color="blue"
            title={m.flags_read_only_title()}
            data-testid="flags-read-only"
          >
            {m.flags_read_only_body()}
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {FLAG_LANE_ORDER.map((lane) => (
            <FlagLaneColumn
              key={lane}
              lane={lane}
              flags={lanes[lane]}
              selectedName={panelOpen ? selectedName : null}
              onOpen={onOpenFlag}
            />
          ))}
        </SimpleGrid>
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
