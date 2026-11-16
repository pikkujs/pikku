/**
 * The topic patterns subscribe functions declared, in template-literal syntax
 * (`order:${string}`), without duplicates and in a stable order.
 */
export const collectEventHubTopicPatterns = (
  functionsMeta: Record<string, { subscribe?: { topicPattern: string } }>
): string[] =>
  [
    ...new Set(
      Object.values(functionsMeta)
        .map((meta) => meta.subscribe?.topicPattern)
        .filter((pattern): pattern is string => typeof pattern === 'string')
    ),
  ].sort()

/**
 * Generates `EventHubTopic`: every topic a subscribe function can return.
 * `never` when the project declares none, so a publish call has nothing to
 * name.
 */
export const serializeEventHubTopics = (
  patterns: readonly string[]
): string => {
  const members = patterns.map((pattern) =>
    pattern.includes('${') ? `\`${pattern}\`` : JSON.stringify(pattern)
  )
  return `/**
 * Every topic a \`pikkuSubscribeFunc\` can return. Generated: a topic that no
 * subscribe function declares cannot be published.
 */
export type EventHubTopic = ${members.length > 0 ? members.join(' | ') : 'never'}
`
}
