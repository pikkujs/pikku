/**
 * Prints what each matrix generated and dropped, by reason:
 * `bun src/testing/trace-matrix/report.ts`
 */
import {
  chainMatrix,
  EXCLUSIONS,
  pairwiseMatrix,
  workflowMatrix,
} from './dimensions.js'

for (const { report, combos } of [
  chainMatrix(),
  workflowMatrix(),
  pairwiseMatrix(),
]) {
  console.log(
    `${report.name}: ${combos.length} tests from ${report.generated}, ${report.included} kept`
  )
  for (const [id, count] of Object.entries(report.excluded)) {
    const why = EXCLUSIONS.find((rule) => rule.id === id)?.why
    console.log(`  ${count} ${id}: ${why ?? 'see the rules this pair crosses'}`)
  }
}
