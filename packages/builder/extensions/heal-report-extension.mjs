import { writeFileSync } from 'node:fs'

export default function (pi) {
  const file = process.env.PIKKU_HEAL_REPORT
  if (!file) return
  pi.registerTool({
    name: 'report_fix',
    label: 'Report the fix',
    description:
      'Tell Studio whether you got the project running again. Call it once, last, after you committed the fix and checked it with `pikku all`. ' +
      'Say fixed: false if you could not, with what is in the way, so the user can be told.',
    parameters: {
      type: 'object',
      properties: {
        fixed: { type: 'boolean', description: 'True only if the project should now start.' },
        summary: { type: 'string', description: 'One plain sentence on what was wrong and what you did, or what is still in the way.' },
      },
      required: ['fixed', 'summary'],
    },
    async execute(_toolCallId, params) {
      writeFileSync(file, JSON.stringify({ fixed: params?.fixed === true, summary: String(params?.summary ?? '').trim() }))
      return { content: [{ type: 'text', text: 'Reported. You can stop now.' }] }
    },
  })
}
