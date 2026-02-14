import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphProjectSetupWorkflow = pikkuWorkflowGraph({
  name: 'graphProjectSetupWorkflow',
  tags: ['project'],
  nodes: {
    create_project: 'projectCreate',
    add_owner_as_member: 'projectMemberAdd',
    notify_owner: 'notifyEmail',
    get_members: 'projectMemberList',
  },
  config: {
    create_project: {
      next: 'add_owner_as_member',
      input: (ref, template) => ({
        name: ref('trigger', 'name'),
        description: ref('trigger', 'description'),
        ownerId: ref('trigger', 'ownerId'),
      }),
    },
    add_owner_as_member: {
      next: 'notify_owner',
      input: (ref, template) => ({
        projectId: ref('create_project', 'id'),
        userId: ref('trigger', 'ownerId'),
        role: 'owner',
      }),
    },
    notify_owner: {
      next: 'get_members',
      input: (ref, template) => ({
        userId: ref('trigger', 'ownerId'),
        subject: template('Project "$0" created', [ref('trigger', 'name')]),
        body: template('Your project has been created with $0 initial tasks.', [
          { $ref: 'data.initialTasks.length' } as any,
        ]),
      }),
    },
    get_members: {
      input: (ref, template) => ({
        projectId: ref('create_project', 'id'),
      }),
    },
  },
})
