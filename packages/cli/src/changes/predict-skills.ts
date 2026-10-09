/** What kind of work a change is, by what it says, and the skill that teaches it. */
const KIND_SKILLS: Array<[RegExp, string]> = [
  [/\b(permissions?|roles?|scopes?|admins?|access|allowed)\b/i, 'pikku-permissions'],
  [/\b(sign[- ]?in|log[- ]?in|sign[- ]?up|auth\w*|passwords?)\b/i, 'pikku-auth'],
  [/\b(emails?|newsletters?)\b/i, 'pikku-emails'],
  [/\b(workflows?|schedules?|reminders?|every (day|week|hour|month))\b/i, 'pikku-workflow'],
  [/\b(agents?|assistant|chatbot|AI)\b/, 'pikku-agent'],
  [/\b(webhooks?)\b/i, 'pikku-webhook'],
  [/\b(live|real[- ]?time|notifications?)\b/i, 'pikku-realtime'],
  [/\b(translat\w*|languages?|i18n|locales?)\b/i, 'pikku-i18n'],
  [/\b(themes?|colou?rs?|fonts?|dark mode)\b/i, 'pikku-theme'],
  [/\b(search|filters?|sort\w*|paginat\w*)\b/i, 'pikku-list-query'],
  [/\b(screens?|pages?|buttons?|forms?|layout|menu)\b/i, 'pikku-react'],
]

export function predictSkills(
  texts: Array<string | null | undefined>,
  touches: { creates?: string[]; alters?: string[]; needsPlan?: boolean }[] = []
): string[] {
  const text = texts.filter(Boolean).join('\n')
  const skills = new Set<string>()
  if (touches.some((t) => t.needsPlan)) skills.add('pikku-architect')
  if (touches.some((t) => t.creates?.length || t.alters?.length))
    skills.add('pikku-kysely')
  for (const [pattern, skill] of KIND_SKILLS)
    if (pattern.test(text)) skills.add(skill)
  return [...skills]
}
