import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import type {
  ExamplesAddResult,
  ExamplesListResult,
  ExamplesShowResult,
} from './schemas.js'

export const renderExamplesList = (
  _services: unknown,
  { examples }: ExamplesListResult
): void => {
  if (examples.length === 0) {
    console.log(dim('no examples matched'))
    return
  }
  for (const example of examples) {
    const tags = [example.lang]
    if (example.entity) tags.push(`--entity`)
    console.log(
      `${added(example.name)} ${dim(`(${tags.join(', ')})`)}  ${example.title}`
    )
    if (example.when) console.log(`  ${dim(example.when)}`)
    console.log()
  }
  console.log('─'.repeat(40))
  console.log(
    dim(
      `${examples.length} example${examples.length !== 1 ? 's' : ''}  ·  read one with \`pikku examples show --name <name>\`, write it with \`pikku examples add --name <name>\``
    )
  )
}

const renderNotes = (
  notes: { anchor: string | null; lines: string[] }[]
): void => {
  if (notes.length === 0) return
  console.log()
  console.log(
    dim('What the example says about itself — none of this lands in the files:')
  )
  for (const note of notes) {
    console.log()
    if (note.anchor) console.log(`${changed('▸')} ${note.anchor}`)
    for (const line of note.lines) console.log(`  ${line}`)
  }
}

export const renderExamplesShow = (
  _services: unknown,
  result: ExamplesShowResult
): void => {
  if (!result.found) {
    console.log(removed(`✗  no example named "${result.name}"`))
    console.log(dim(`available: ${result.available.join(', ')}`))
    return
  }
  console.log(`${added(result.name)}  ${result.title}`)
  if (result.when) console.log(dim(result.when))
  console.log(dim(result.source))
  console.log()
  console.log(result.code)
  renderNotes(result.notes)
  if (result.steps) {
    console.log()
    console.log(result.steps)
  }
}

export const renderExamplesAdd = (
  _services: unknown,
  result: ExamplesAddResult
): void => {
  if (result.refusal) {
    console.log(changed('⏸') + '  ' + result.refusal)
    process.exitCode = 1
    return
  }

  const label = result.entity
    ? `${result.name} (${result.entity})`
    : result.name
  console.log(
    `${added('✓')}  ${label} — ${result.written.length} file(s) written, already named for this app`
  )
  for (const path of result.written) console.log(`  ${added('+')} ${path}`)
  if (result.kept.length > 0) {
    console.log(
      dim(
        `  ${result.kept.length} already existed and were left untouched: ${result.kept.join(', ')}`
      )
    )
  }
  for (const failure of result.failed)
    console.log(`  ${removed('✗')} ${failure}`)

  if (result.deferred.length > 0) {
    console.log()
    console.log(
      changed('⏸') +
        `  not written — ${result.deferred.length} file(s) build their schemas from a table this project does not have yet:`
    )
    for (const entry of result.deferred) {
      console.log(
        `  · ${entry.path} — needs ${entry.tables.map((t) => `\`${t}\``).join(', ')}`
      )
    }
    console.log(
      dim(
        'Write that migration in db/<engine>/*.sql, run `pikku db migrate`, then run this again and the file lands.'
      )
    )
  }

  if (result.api.length > 0) {
    console.log()
    console.log(
      dim(
        'Their API — compose against this rather than reading the files back:'
      )
    )
    for (const file of result.api) {
      console.log()
      console.log(`${file.path} — exports ${file.exports.join(', ')}`)
      for (const declaration of file.declarations) {
        console.log(declaration.replace(/^/gm, '  '))
      }
    }
  }

  if (result.manual.length > 0) {
    console.log()
    console.log(
      changed('⚠') +
        `  ${result.name} also needs ${result.manual.join(', ')}, which carry an example domain — run each with the entity it is for.`
    )
  }

  if (result.when) {
    console.log()
    console.log(result.when)
  }
  renderNotes(result.notes)
  if (result.steps) {
    console.log()
    console.log(result.steps)
  }
}
