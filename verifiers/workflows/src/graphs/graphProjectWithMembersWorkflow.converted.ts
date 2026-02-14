import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphProjectWithMembersWorkflow = pikkuWorkflowGraph({
  name: 'graphProjectWithMembersWorkflow',
  nodes: {
    create_project: 'projectCreate',
    add_owner: 'projectMemberAdd',
    add_member_invite_userid: 'projectMemberAdd',
    notify_member_invite_userid: 'notifyEmail',
    list_members: 'projectMemberList',
  },
  config: {
    create_project: {
      next: 'add_owner',
      input: (ref, template) => ({
        name: ref('trigger', 'name'),
        ownerId: ref('trigger', 'ownerId'),
      }),
    },
    add_owner: {
      next: 'add_member_invite_userid',
      input: (ref, template) => ({
        projectId: ref('create_project', 'id'),
        userId: ref('trigger', 'ownerId'),
        role: 'owner',
      }),
    },
    add_member_invite_userid: {
      input: (ref, template) => ({
        projectId: ref('create_project', 'id'),
      }),
    },
    notify_member_invite_userid: {
      input: (ref, template) => ({
        subject: template("You've been added to project: $0", [
          ref('trigger', 'name'),
        ]),
        body: template('You have been added as a $0 to the project.', [
          { $ref: 'invite.role' } as any,
        ]),
      }),
    },
    list_members: {
      input: (ref, template) => ({
        projectId: ref('create_project', 'id'),
      }),
    },
  },
})
