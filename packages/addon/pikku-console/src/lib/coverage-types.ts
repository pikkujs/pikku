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
