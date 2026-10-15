export const SPECIALISTS = [
  'build',
  'frontend',
  'artifacts',
  'knowledge',
  'emails',
] as const

export type Specialist = (typeof SPECIALISTS)[number]

export const FALLBACK_SPECIALIST: Specialist = 'build'

export const isSpecialist = (value: unknown): value is Specialist =>
  typeof value === 'string' &&
  (SPECIALISTS as readonly string[]).includes(value)

export type Tagged = {
  specialist?: Specialist | null
  dependsOn?: string[] | null
}

const BACKEND =
  /\b(databases?|tables?|records?|permissions?|roles?|auth\w*|sign[- ]?in|workflows?|schedules?|webhooks?|agents?|api|functions?|endpoints?|migrations?)\b/i

const RULES: Array<[RegExp, Specialist]> = [
  [/\b(emails?|newsletters?|e-mails?)\b/i, 'emails'],
  [/\b(knowledge( base)?|interview|open questions?)\b/i, 'knowledge'],
  [/\b(artifacts?|mockups?|mocks?|prototypes?)\b/i, 'artifacts'],
  [
    /\b(screens?|pages?|buttons?|forms?|layout|menu|themes?|colou?rs?|fonts?|styl\w*|copy|wording)\b/i,
    'frontend',
  ],
]

export function inferSpecialist(
  ...texts: Array<string | null | undefined>
): Specialist {
  const text = texts.filter(Boolean).join('\n')
  if (BACKEND.test(text)) return FALLBACK_SPECIALIST
  for (const [pattern, specialist] of RULES)
    if (pattern.test(text)) return specialist
  return FALLBACK_SPECIALIST
}

export const specialistOf = (
  change: {
    title: string
    body?: string | null
  } & Tagged
): Specialist =>
  isSpecialist(change.specialist)
    ? change.specialist
    : inferSpecialist(change.title, change.body)

export function nextSpecialist(
  changes: Array<{ title: string; body?: string | null } & Tagged>
): Specialist | null {
  const present = new Set(changes.map(specialistOf))
  return SPECIALISTS.find((s) => present.has(s)) ?? null
}
