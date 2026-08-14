/**
 * Decide whether one run is in a scorer's sample.
 *
 * Deterministic on `(runId, scorerName)` rather than random, so re-running the
 * decision — a retried job, a replayed run, a test — always lands the same way,
 * and so two scorers at the same rate do not sample the same runs.
 */
export const isSampled = (
  runId: string,
  scorerName: string,
  sampleRate: number
): boolean => {
  if (sampleRate >= 1) return true
  if (sampleRate <= 0) return false

  const key = `${scorerName}:${runId}`
  // FNV-1a: no crypto dependency, and stable across processes and platforms,
  // which a language-level string hash is not guaranteed to be.
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  // FNV-1a alone leaves its high bits barely moved between keys that differ
  // only in their last characters — sequential run ids being exactly that —
  // which biases the fraction actually sampled well away from the rate asked
  // for. MurmurHash3's finalizer spreads the low bits back over the whole word.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0
  hash ^= hash >>> 16

  return (hash >>> 0) / 0x100000000 < sampleRate
}
