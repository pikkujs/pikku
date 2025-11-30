/**
 * Matrix iteration workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const matrixIterationWorkflow = pikkuWorkflowFunc<
  { rows: string[]; columns: string[] },
  { cellsProcessed: number }
>(async (_services, data, { workflow }) => {
  let cellsProcessed = 0

  // Iterate through matrix
  for (const row of data.rows) {
    for (const col of data.columns) {
      await workflow.do(`Process cell [${row}][${col}]`, 'taskCreate', {
        title: `Process ${row}-${col}`,
        description: `Matrix cell at row ${row}, column ${col}`,
      })
      cellsProcessed++
    }

    // Log row completion
    await workflow.do(`Log row ${row} complete`, 'notifySlack', {
      channel: '#processing',
      message: `Row ${row} processing complete`,
    })
  }

  return { cellsProcessed }
})
