import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphProjectArchiveWorkflow = pikkuWorkflowGraph({
  name: 'graphProjectArchiveWorkflow',
  nodes: {
    get_project: 'projectGet',
    get_project_tasks: 'projectTaskList',
    get_project_members: 'projectMemberList',
    notify_member_member_userid: 'notifyEmail',
    archive_project: 'projectArchive',
  },
  config: {
    get_project: {
      next: 'get_project_tasks',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
    get_project_tasks: {
      next: 'get_project_members',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
    get_project_members: {
      next: 'archive_project',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
    notify_member_member_userid: {
      next: 'archive_project',
      input: (ref, template) => ({
        subject: template('Project "$0" is being archived', [
          ref('get_project', 'name'),
        ]),
        body: 'The project has been archived. You will no longer have access.',
      }),
    },
    archive_project: {
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
  },
})
