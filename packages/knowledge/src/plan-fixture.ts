import { PLAN_VERSION, type Plan } from './plan.js'
import { noteHash } from './notes.js'

/**
 * One plan that passes every check, as the thing tests vary from.
 *
 * Shared rather than copied because two suites now need a plan the reader accepts, and a
 * second hand-written one drifts the moment a schema rule changes — the failure would show
 * as an unrelated suite going red for a plan that was never the point of it.
 */
export const basePlan = (
  milestone = 'knowledge/milestones/01-the-daily-entry.md'
): Plan => ({
  version: PLAN_VERSION,
  deferrals: [],
  milestone,
  description: 'One person writes one entry a day and reads their own back.',
  covers: [
    {
      note: 'entities/entry.md',
      hash: noteHash('entry body'),
      complete: true,
    },
  ],
  model: {
    kind: 'built',
    description: 'One table.',
    items: [
      {
        table: 'entry',
        description: 'One row per person per day.',
        fields: [
          { name: 'id', type: 'uuid', classification: 'internal' },
          { name: 'body', type: 'text', classification: 'personal' },
        ],
        relationships: [],
      },
    ],
  },
  functions: {
    kind: 'built',
    description: 'Write and read.',
    items: [
      {
        name: 'createEntry',
        description: "Creates today's entry on the entry table.",
        pass: 1,
        wire: { transport: 'http', route: 'POST /entry' },
        scopes: [],
        permission: 'Only the signed-in person can write their own entry',
      },
    ],
  },
  roles: {
    kind: 'built',
    description: 'One role.',
    items: [{ name: 'member', description: 'In the org.', app: 'journal' }],
  },
  scopes: { kind: 'n/a', description: 'No third-party access yet.' },
  ui: {
    kind: 'built',
    description: 'One screen.',
    items: [
      {
        route: '/app/today',
        description: "Write today's entry.",
        pass: 1,
        scenarios: ['features/today.feature#Writing today'],
      },
    ],
  },
  scenarios: {
    backend: {
      kind: 'built',
      description: 'The one-per-day rule.',
      items: [
        {
          feature: 'features/entry.feature',
          scenario: 'A second entry for today is refused',
          name: 'secondEntryRefusedScenario',
        },
      ],
    },
    browser: {
      kind: 'built',
      description: 'Writing it.',
      items: [
        {
          feature: 'features/today.feature',
          scenario: "'owner' writes today's entry",
          name: 'ownerWritesTodayScenario',
        },
      ],
    },
    permission: {
      kind: 'built',
      description: 'Someone else cannot.',
      items: [
        {
          fn: 'createEntry',
          feature: 'features/entry-perms.feature',
          scenario: 'Another member is refused',
          name: 'anotherMemberRefusedScenario',
        },
      ],
    },
  },
})
