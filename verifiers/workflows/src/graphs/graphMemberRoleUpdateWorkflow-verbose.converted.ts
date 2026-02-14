import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphMemberRoleUpdateWorkflow = pikkuWorkflowGraph({
  name: 'graphMemberRoleUpdateWorkflow',
  tags: ['project'],
  nodes: {
    get_project: 'projectGet',
    remove_member: 'projectMemberRemove',
    re_add_member_with_new_role: 'projectMemberAdd',
    notify_member_of_role_change: 'notifyEmail',
  },
  config: {
    get_project: {
      next: 'remove_member',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
    remove_member: {
      next: 're_add_member_with_new_role',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
        userId: ref('trigger', 'userId'),
      }),
    },
    re_add_member_with_new_role: {
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
        userId: ref('trigger', 'userId'),
        role: ref('trigger', 'newRole'),
      }),
    },
    notify_member_of_role_change: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        subject: template('Your role has changed in project: $0', [
          ref('get_project', 'name'),
        ]),
        body: template('Your new role is: $0', [ref('trigger', 'newRole')]),
      }),
    },
  },
})
