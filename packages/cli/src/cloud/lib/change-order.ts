import { CloudPreconditionError } from '../../utils/precondition-error.js'

type Node = { changeId: string; dependsOn?: string[] | null }
type Stateful = Node & { status: string }

const FINISHED = new Set(['done', 'dismissed'])

export function assertDependencies(
  existing: Node[],
  changeId: string,
  dependsOn: string[]
): void {
  const known = new Map(existing.map((c) => [c.changeId, c]))
  for (const id of dependsOn)
    if (id !== changeId && !known.has(id))
      throw new CloudPreconditionError(
        `depends_on names ${id}, which is not a change in this project.`
      )
  const edges = (id: string) =>
    id === changeId ? dependsOn : (known.get(id)?.dependsOn ?? [])
  const seen = new Set<string>()
  const stack = [...dependsOn]
  while (stack.length) {
    const id = stack.pop()!
    if (id === changeId)
      throw new CloudPreconditionError(
        `depends_on would make #${changeId} wait on itself through a cycle.`
      )
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...edges(id))
  }
}

export function runnable<T extends Node>(ready: T[], all: Stateful[]): T[] {
  const open = new Set(
    all.filter((c) => !FINISHED.has(c.status)).map((c) => c.changeId)
  )
  return ready.filter((c) => !(c.dependsOn ?? []).some((id) => open.has(id)))
}
