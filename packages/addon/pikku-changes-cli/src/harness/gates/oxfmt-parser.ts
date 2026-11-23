import type { Finding } from '../finding.js'
import type { RawOutput } from '../run-cli.js'

/** Lines `oxfmt --write` prints when it ran; anything else is output it was not expected to give. */
const WRITE_NOTICES = [
  /^Finished in \d+(?:\.\d+)?m?s on \d+ files? using \d+ threads?\.$/,
  /^No config found, using defaults\./,
  /^No files found matching the given patterns\.$/,
]

/** `oxfmt --write`: it fixes and reports nothing, so a run is either clean or unparseable. */
export const parseOxfmtWrite = ({ stdout, stderr }: RawOutput): Finding[] => {
  const unexpected = `${stdout}\n${stderr}`
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => line && !WRITE_NOTICES.some((notice) => notice.test(line))
    )
  if (unexpected.length)
    throw new Error(`unexpected oxfmt output: ${unexpected[0]}`)
  return []
}

const SOURCE_PATH = /^\S+(?: \S+)*\.(?:[cm]?[jt]sx?)$/

/** `oxfmt --list-different`: one path per line on stdout for each file that is not formatted. */
export const parseOxfmtListDifferent = ({ stdout }: RawOutput): Finding[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => {
      if (!SOURCE_PATH.test(file))
        throw new Error(`not a file path in oxfmt output: ${file}`)
      return {
        file,
        severity: 'low' as const,
        rule: 'oxfmt',
        message: 'File is not formatted',
      }
    })
