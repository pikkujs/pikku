import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphContactMergeWorkflow = pikkuWorkflowGraph({
  name: 'graphContactMergeWorkflow',
  nodes: {
    get_primary_contact: 'contactGet',
    update_primary_with_merged_data: 'contactUpdate',
    notify_merge_complete: 'notifySlack',
  },
  config: {
    get_primary_contact: {
      next: 'notify_merge_complete',
      input: (ref, template) => ({
        contactId: ref('trigger', 'primaryContactId'),
      }),
    },
    update_primary_with_merged_data: {
      next: 'notify_merge_complete',
      input: (ref, template) => ({
        contactId: ref('trigger', 'primaryContactId'),
        data: ref('trigger', 'mergedData'),
      }),
    },
    notify_merge_complete: {
      input: (ref, template) => ({
        channel: '#crm',
        message: template('Merged $0 contacts into $1', [
          { $ref: 'data.duplicateContactIds.length' } as any,
          ref('trigger', 'primaryContactId'),
        ]),
      }),
    },
  },
})
