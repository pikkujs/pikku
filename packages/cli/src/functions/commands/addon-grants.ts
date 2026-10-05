import { createInterface } from 'node:readline/promises'

export type GrantDecision = 'proceed' | 'declined' | 'needs-confirmation'

export const grantLines = (
  wired: { name: string; uses: Record<string, string> }[]
): string[] =>
  wired.flatMap(({ name, uses }) =>
    Object.values(uses).map((used) => `${name} can use ${used}`)
  )

const askYesNo = async (question: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}

export const confirmGrants = async (
  lines: string[],
  options: {
    yes?: boolean
    interactive: boolean
    ask?: (question: string) => Promise<boolean>
  }
): Promise<GrantDecision> => {
  if (lines.length === 0 || options.yes) return 'proceed'
  if (!options.interactive) return 'needs-confirmation'
  return (await (options.ask ?? askYesNo)('Install and allow this? [y/N] '))
    ? 'proceed'
    : 'declined'
}
