const screens = () =>
  (process.env.PIKKU_STUDIO_SCREENS ?? '')
    .split(',')
    .map((screen) => screen.trim())
    .filter(Boolean)

export default function (pi) {
  const known = screens()
  pi.registerTool({
    name: 'navigate',
    label: 'Open a screen',
    description:
      'Show the user a button that opens a Studio screen for something you just built or changed, ' +
      'such as the workflow you wrote or the page you added. Studio turns it into a link; you never build URLs. ' +
      'Call it once, after the work checks out, and only for a thing you named.' +
      (known.length ? ` Screens: ${known.join(', ')}.` : ''),
    parameters: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          description: 'The Studio screen to open.',
          ...(known.length ? { enum: known } : {}),
        },
        id: { type: 'string', description: 'The thing on that screen to open, such as a workflow or page name.' },
        title: { type: 'string', description: 'What the button says, in the user’s words.' },
      },
      required: ['screen'],
    },
    async execute(_toolCallId, params) {
      const screen = String(params?.screen ?? '').trim()
      if (!screen || (known.length && !known.includes(screen))) {
        return {
          content: [{ type: 'text', text: `There is no "${screen}" screen.${known.length ? ` Use one of: ${known.join(', ')}.` : ''}` }],
          isError: true,
        }
      }
      const navigate = {
        screen,
        ...(params.id?.trim() ? { id: params.id.trim() } : {}),
        ...(params.title?.trim() ? { title: params.title.trim() } : {}),
      }
      return {
        content: [{ type: 'text', text: `The user now has a button that opens ${navigate.title ?? screen}.` }],
        details: { navigate },
      }
    },
  })
}
