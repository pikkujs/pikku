/** One flag as the admin addon lists it — `admin:flagList`'s row shape. */
export type FlagBoardRow = {
  name: string
  description?: string
  anyOf?: string[]
  enabled: boolean
  rolloutPercent: number | null
  /** Still declared in code. False means the declaration is gone and the row is
   *  waiting on a prune. */
  declared: boolean
  /** The backing store holds a row for it. False means an absent row, which
   *  fails open — the flag is live for everyone. */
  backed: boolean
}

export type FlagLaneId = 'dark' | 'rolling' | 'live' | 'attention'

/** Left to right: the order a flag travels in, with the lane that is not part
 *  of the journey at the end. */
export const FLAG_LANE_ORDER: readonly FlagLaneId[] = [
  'dark',
  'rolling',
  'live',
  'attention',
]

export type FlagAttentionReason =
  /** Declared in code, no row in the store: it fails open, so a dark launch is
   *  already live for everyone. */
  | 'unbacked'
  /** A row whose declaration has gone from code — `pikku flags prune` clears
   *  it, and nothing resolves it in the meantime. */
  | 'undeclared'

/**
 * Whether the flag's rollout admits every subject.
 *
 * `null` is no limit at all and `100` is a limit that excludes nobody: the two
 * are different rows in the store and the same thing to a user, so the lane a
 * flag sits in and the confirmation the panel asks for both read them alike.
 */
export const admitsEveryone = (
  flag: Pick<FlagBoardRow, 'rolloutPercent'>
): boolean => flag.rolloutPercent === null || flag.rolloutPercent >= 100

export const flagAttentionReason = (
  flag: FlagBoardRow
): FlagAttentionReason | null => {
  if (!flag.declared) return 'undeclared'
  if (!flag.backed) return 'unbacked'
  return null
}

/**
 * Which lane a flag belongs in.
 *
 * Attention is checked first and beats every other reading: an unbacked flag
 * reports `enabled: true` with no rollout, which is indistinguishable from a
 * deliberate full launch, and putting it under Live is precisely the mistake
 * the lane exists to catch.
 */
export const flagLaneOf = (flag: FlagBoardRow): FlagLaneId => {
  if (flagAttentionReason(flag)) return 'attention'
  if (!flag.enabled) return 'dark'
  return admitsEveryone(flag) ? 'live' : 'rolling'
}

export type FlagLanes = Record<FlagLaneId, FlagBoardRow[]>

/** Every lane present, empty ones included: a board whose columns appear and
 *  disappear with the data is a board you cannot learn the shape of. */
export const groupFlagsByLane = (flags: readonly FlagBoardRow[]): FlagLanes => {
  const lanes: FlagLanes = { dark: [], rolling: [], live: [], attention: [] }
  for (const flag of flags) {
    lanes[flagLaneOf(flag)].push(flag)
  }
  return lanes
}
