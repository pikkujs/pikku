import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDigestBuilderWorkflow = pikkuWorkflowGraph({
  name: 'graphDigestBuilderWorkflow',
  nodes: {
    collect_digest_items: 'digestCollect',
    format_digest: 'digestFormat',
    send_digest: 'emailSend',
  },
  config: {
    collect_digest_items: {
      next: 'format_digest',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        since: ref('trigger', 'since'),
      }),
    },
    format_digest: {
      next: 'send_digest',
      input: (ref, template) => ({
        items: ref('collect_digest_items', 'items'),
        format: ref('trigger', 'format'),
      }),
    },
    send_digest: {
      input: (ref, template) => ({
        to: template('user-$0@example.com', [ref('trigger', 'userId')]),
        subject: template('Your Daily Digest - $0 updates', [
          ref('format_digest', 'itemCount'),
        ]),
        body: ref('format_digest', 'formatted'),
      }),
    },
  },
})
