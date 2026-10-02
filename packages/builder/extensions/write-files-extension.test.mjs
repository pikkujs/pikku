import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import register from './write-files-extension.mjs'

const OXFMT = resolve(import.meta.dirname, '../node_modules/.bin/oxfmt')

if (!existsSync(OXFMT)) throw new Error(`no oxfmt at ${OXFMT} — run \`bun install\` first`)

const MINIFIED =
  'export const getPet=pikkuSessionlessFunc<void,{id:string}>({auth:true,func:async({kysely},input,_i,session)=>{const rows=await kysely.selectFrom("pet").selectAll().execute();return rows.filter((v)=>v.ownerId===session.userId)}})\n'

function project({ withConfig }) {
  const dir = mkdtempSync(join(tmpdir(), 'write-files-'))
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  symlinkSync(OXFMT, join(dir, 'node_modules/.bin/oxfmt'))
  if (withConfig) writeFileSync(join(dir, '.oxfmtrc.json'), '{"semi":false,"singleQuote":true}')
  return dir
}

function load() {
  let tool
  register({ registerTool: (t) => (tool = t), on: () => {} })
  return tool
}

async function write(dir, files) {
  return load().execute('id', { files }, null, null, { cwd: dir })
}

test('a minified file is broken back onto real lines as it is written', async () => {
  const dir = project({ withConfig: true })
  const result = await write(dir, [{ path: 'src/get-pet.function.ts', content: MINIFIED }])
  const out = readFileSync(join(dir, 'src/get-pet.function.ts'), 'utf8')
  assert.ok(out.split('\n').length > 5, `still on one line:\n${out}`)
  assert.ok(out.includes("'pet'"), 'the project config was not picked up')
  assert.match(result.content[0].text, /reformatted on write/)
})

test('generated output is left exactly as written', async () => {
  const dir = project({ withConfig: true })
  await write(dir, [{ path: 'src/rpc-map.gen.ts', content: MINIFIED }])
  assert.equal(readFileSync(join(dir, 'src/rpc-map.gen.ts'), 'utf8'), MINIFIED)
})

test('a project with no formatter config keeps its own style', async () => {
  const dir = project({ withConfig: false })
  const result = await write(dir, [{ path: 'src/a.ts', content: MINIFIED }])
  assert.equal(readFileSync(join(dir, 'src/a.ts'), 'utf8'), MINIFIED)
  assert.doesNotMatch(result.content[0].text, /reformatted on write/)
})

test('a file oxfmt cannot parse survives, and the rest of the batch is formatted', async () => {
  const dir = project({ withConfig: true })
  const broken = 'export const y = {{{ broken\n'
  await write(dir, [
    { path: 'src/broken.ts', content: broken },
    { path: 'src/ok.ts', content: MINIFIED },
  ])
  assert.equal(readFileSync(join(dir, 'src/broken.ts'), 'utf8'), broken)
  assert.ok(readFileSync(join(dir, 'src/ok.ts'), 'utf8').split('\n').length > 5)
})

// Formatting rewrites the text the agent holds anchors against, so it now happens only to
// the files that actually need it. A file the model wrote at a sane width comes back
// character-for-character as it sent it, and its anchors still match.
test('a well-formatted file is left exactly as it was sent', async () => {
  const dir = project({ withConfig: true })
  const sent = "const a = 1\nconst b = 2\n\nexport const sum = () => {\n  return a + b\n}\n"
  const result = await write(dir, [{ path: 'src/sane.ts', content: sent }])
  assert.equal(readFileSync(join(dir, 'src/sane.ts'), 'utf8'), sent)
  assert.doesNotMatch(result.content[0].text, /reformatted on write/)
})

test('a catalog write keeps the keys it did not send, and says so', async () => {
  const dir = project({ withConfig: true })
  mkdirSync(join(dir, 'apps/app/messages'), { recursive: true })
  writeFileSync(
    join(dir, 'apps/app/messages/en.json'),
    JSON.stringify({
      $schema: 'https://inlang.com/schema/inlang-message-format',
      common__email: 'Email',
      auth__signup__title: 'Create your account',
      validation__required: 'Required',
    }),
  )

  const result = await write(dir, [
    {
      path: 'apps/app/messages/en.json',
      content: JSON.stringify({ common__email: 'Your email', inbox__saved: 'Change saved' }),
    },
  ])

  const out = JSON.parse(readFileSync(join(dir, 'apps/app/messages/en.json'), 'utf8'))
  assert.equal(out.auth__signup__title, 'Create your account')
  assert.equal(out.validation__required, 'Required')
  assert.equal(out.$schema, 'https://inlang.com/schema/inlang-message-format')
  assert.equal(out.common__email, 'Your email')
  assert.equal(out.inbox__saved, 'Change saved')
  assert.match(result.content[0].text, /MERGED — 2 key\(s\)/)
})

test('a catalog write that sends everything is not reported as a merge', async () => {
  const dir = project({ withConfig: true })
  mkdirSync(join(dir, 'apps/app/messages'), { recursive: true })
  writeFileSync(join(dir, 'apps/app/messages/en.json'), JSON.stringify({ a__b: 'A' }))

  const result = await write(dir, [
    { path: 'apps/app/messages/en.json', content: JSON.stringify({ a__b: 'A2', c__d: 'C' }) },
  ])

  assert.doesNotMatch(result.content[0].text, /MERGED/)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'apps/app/messages/en.json'), 'utf8')), {
    a__b: 'A2',
    c__d: 'C',
  })
})

test('a non-catalog json file is replaced outright', async () => {
  const dir = project({ withConfig: true })
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }))

  await write(dir, [{ path: 'tsconfig.json', content: JSON.stringify({ include: ['src'] }) }])

  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')), {
    include: ['src'],
  })
})
