import { pikkuSessionlessFunc } from '#pikku'
import { functionCoveragePath } from '../lib/function-tests-paths.js'
import { nodeFsPromises } from '../lib/node-builtins.js'

export type CoverageStatus = 'covered' | 'partial' | 'uncovered' | 'unknown'

export interface FunctionCoverageEntry {
  name: string
  sourceFile: string
  exposed: boolean
  description: string | null
  coveredLines: number
  totalLines: number
  missedLines: number[]
  ratio: number
  status: CoverageStatus
}

export interface FunctionCoverageReport {
  generatedAt: string
  summary: {
    total: number
    covered: number
    partial: number
    uncovered: number
    unknown: number
    overallRatio: number
  }
  functions: FunctionCoverageEntry[]
}

export const getFunctionCoverage = pikkuSessionlessFunc<
  null,
  FunctionCoverageReport | null
>({
  title: 'Get Function Coverage',
  description:
    'Reads function-coverage.json produced by the function-tests harness and returns it, or null if no coverage data exists yet.',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    if (!metaService?.basePath) return null
    const coveragePath = functionCoveragePath(metaService.basePath)
    try {
      const content = await nodeFsPromises().readFile(coveragePath, 'utf-8')
      return JSON.parse(content) as FunctionCoverageReport
    } catch {
      return null
    }
  },
})
