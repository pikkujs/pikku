const ago = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

const run = (
  persona: string,
  hours: number,
  intents: { id: string; title: string; status: string }[],
  findings: object[],
  status = 'completed',
  error: string | null = null
) => ({
  runId: `preview-${persona}-${hours}`,
  persona,
  disposition: 'realistic',
  seed: 42,
  status,
  goals: [],
  findings,
  intents: intents.map((intent) => ({
    ...intent,
    sourceId: intent.id,
    steps: [],
    suspensions: 0,
  })),
  tally: { steps: 38, calls: 31, mutations: 6 },
  stoppedBy: 'goals-met',
  error,
  createdAt: ago(hours + 0.1),
  finishedAt: ago(hours),
})

export const PREVIEW_RUNS = [
  run(
    'guest',
    46,
    [
      {
        id: 'book-group',
        title: 'Book a seminar room for a group of 12',
        status: 'stuck',
      },
      {
        id: 'change-date',
        title: 'Move the booking to the following weekend',
        status: 'completed',
      },
    ],
    [
      {
        kind: 'server-error',
        detail: 'Internal Server Error',
        rpcName: 'bookings:create',
        status: 500,
        intentId: 'book-group',
        step: 14,
      },
      {
        kind: 'server-error',
        detail: 'Internal Server Error',
        rpcName: 'bookings:create',
        status: 500,
        intentId: 'book-group',
        step: 17,
      },
      {
        kind: 'unexpected-success',
        detail: 'bookings:listAll returned 200 for a guest session',
        rpcName: 'bookings:listAll',
        status: 200,
        intentId: 'change-date',
        step: 22,
      },
    ]
  ),
  run(
    'visitor',
    70,
    [
      {
        id: 'find-prices',
        title: 'Find out what a weekend retreat costs',
        status: 'abandoned',
      },
    ],
    [
      {
        kind: 'custom',
        detail: 'Couldn’t find the prices for a weekend retreat anywhere',
        intentId: 'find-prices',
        step: 19,
      },
    ]
  ),
  run(
    'admin',
    50,
    [{ id: 'triage', title: 'Clear the new enquiries', status: 'completed' }],
    []
  ),
  run(
    'owner',
    120,
    [
      {
        id: 'check',
        title: 'Check this month’s bookings add up',
        status: 'completed',
      },
    ],
    []
  ),
]

export const previewRuns = (persona?: string) => {
  try {
    if (localStorage.getItem('virtual-users-preview') !== 'on') return undefined
  } catch (error) {
    console.warn('virtual-users-preview: localStorage unavailable', error)
    return undefined
  }
  return PREVIEW_RUNS.filter((row) => !persona || row.persona === persona)
}
