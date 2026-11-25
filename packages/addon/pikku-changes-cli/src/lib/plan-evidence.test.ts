import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlannedChange } from './change-plan.js'
import { evidenceProblems } from './plan-evidence.js'
import { checkEvidence } from '../functions/changes-file.function.js'

/** A project with a capture of example.com: one page, a form, two outside hosts and a sibling app. */
const captured = async () => {
  const top = await mkdtemp(join(tmpdir(), 'pikku-evidence-'))
  execFileSync('git', ['init', '-q'], { cwd: top })
  const site = join(top, 'artifacts', 'references', 'example.com')
  await mkdir(site, { recursive: true })
  await mkdir(join(top, 'knowledge', 'site'), { recursive: true })
  await writeFile(join(top, 'knowledge', 'site', 'forms.md'), '# forms')
  await writeFile(join(site, 'index.json'), '{}')
  await writeFile(join(site, 'index.behaviour.json'), '{}')
  await writeFile(
    join(site, 'behaviour.json'),
    JSON.stringify({
      outsideHosts: { 'static.wixstatic.com': {}, 'www.google.com': {} },
      forms: [{ fields: [{ type: 'email' }] }],
      siblings: [{ host: 'app.example.com' }],
    })
  )
  return top
}

const change = (ref: string, body: string): PlannedChange => ({
  ref,
  title: ref,
  body,
  specialist: 'frontend',
  dependsOn: [],
})

const named =
  'Replace static.wixstatic.com and www.google.com; keep app.example.com as a link.'

describe('a site plan’s evidence against the capture', () => {
  test('a plan whose citations resolve and that names every host passes', async () => {
    const top = await captured()
    const plan = [
      change(
        'data',
        `${named} Done when you can see it.\n\nEvidence:\n- Sign-up: page:index, behaviour:forms[0].fields\n- Hosts: behaviour:outsideHosts.static.wixstatic.com, note:forms.md`
      ),
    ]
    assert.deepStrictEqual(evidenceProblems(plan, top), [])
  })

  test('names every citation the capture lacks, a line resting on a note, a missing Evidence part and unnamed hosts', async () => {
    const top = await captured()
    const plan = [
      change(
        'data',
        `Done when you can see it.\n\nEvidence:\n- Pages: page:buy__42, behaviour:forms[3], behaviour:submits\n- Inventory: note:site/index.md\n- Hosts: behaviour:outsideHosts.cdn.example.net`
      ),
      change('frame', 'The frame. Done when you can see it.'),
    ]
    const problems = evidenceProblems(plan, top)
    for (const expected of [
      /page:buy__42 is not in the capture/,
      /behaviour:forms\[3\] is not in the capture/,
      /behaviour:submits is not in the capture/,
      /note:site\/index\.md is not in the capture/,
      /"- Inventory: note:site\/index\.md" rests on a note alone/,
      /behaviour:outsideHosts\.cdn\.example\.net is not in the capture/,
      /change 2 \("frame"\): no "Evidence:" lines/,
      /static\.wixstatic\.com, www\.google\.com, app\.example\.com/,
    ])
      assert.ok(
        problems.some((p) => expected.test(p)),
        `${expected} in ${problems.join('\n')}`
      )
  })

  test('a change that captures the original again is refused when the capture exists', async () => {
    const top = await captured()
    const plan = [
      change(
        'data',
        `${named} Done when you can see it.\n\nEvidence:\n- Page: page:index`
      ),
      {
        ...change(
          'capture',
          'Complete the reference where capture was blocked. Done when you can see it.\n\nEvidence:\n- Page: page:index'
        ),
        specialist: 'artifacts' as const,
      },
    ]
    assert.match(
      evidenceProblems(plan, top).join('\n'),
      /change 2 \("capture"\): the capture is already in/
    )
  })

  test('a project with no capture is not checked', async () => {
    const top = await mkdtemp(join(tmpdir(), 'pikku-evidence-'))
    assert.deepStrictEqual(evidenceProblems([change('data', 'x')], top), [])
  })

  test('the first failure refuses the filing; the retry files, with what is still wrong as an open question in the first change', async () => {
    const top = await captured()
    const plan = [
      change(
        'data',
        'Done when you can see it.\n\nEvidence:\n- Page: page:gone'
      ),
    ]
    await assert.rejects(
      checkEvidence(plan, top),
      /The plan was not filed: its evidence does not check out[\s\S]*page:gone is not in the capture/
    )
    await checkEvidence(plan, top)
    assert.match(
      plan[0]!.body,
      /Open question: this evidence did not check out against the capture when the plan was filed:\n- change 1 \("data"\): page:gone is not in the capture/
    )
    // the refusal is used up: a later failing plan is refused again
    await assert.rejects(
      checkEvidence([change('data', 'x')], top),
      /was not filed/
    )
  })
})
