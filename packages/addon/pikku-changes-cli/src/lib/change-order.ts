import { CloudPreconditionError } from '@pikku/cli/addon-support'

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

/**
 * The ready changes whose dependencies are all finished. `unmerged` names
 * changes that are done but not yet in the branch a new worktree is cut from:
 * they still block, or the dependent would be built without them.
 */
export function runnable<T extends Node>(
  ready: T[],
  all: Stateful[],
  unmerged: ReadonlySet<string> = new Set()
): T[] {
  const open = new Set(
    all
      .filter((c) => !FINISHED.has(c.status) || unmerged.has(c.changeId))
      .map((c) => c.changeId)
  )
  return ready.filter((c) => !(c.dependsOn ?? []).some((id) => open.has(id)))
}

/**
 * How many changes sit behind each of these on the longest chain of dependents (itself counts), over the changes still open.
 * A change that unblocks a long chain is on the critical path.
 */
export function chainLengths<T extends Node>(
  start: T[],
  all: Stateful[]
): Map<string, number> {
  const dependents = new Map<string, string[]>()
  for (const c of all) {
    if (FINISHED.has(c.status)) continue
    for (const id of c.dependsOn ?? [])
      dependents.set(id, [...(dependents.get(id) ?? []), c.changeId])
  }
  const memo = new Map<string, number>()
  const depth = (id: string, trail: Set<string>): number => {
    const known = memo.get(id)
    if (known !== undefined) return known
    if (trail.has(id)) return 1 // a cycle is refused when filed; never loop on one
    trail.add(id)
    const below = Math.max(
      0,
      ...(dependents.get(id) ?? []).map((d) => depth(d, trail))
    )
    trail.delete(id)
    memo.set(id, below + 1)
    return below + 1
  }
  return new Map(start.map((c) => [c.changeId, depth(c.changeId, new Set())]))
}
