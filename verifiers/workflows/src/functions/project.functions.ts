/**
 * Project Management Functions
 * Mock implementations for project CRUD and member management
 */

import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Project CRUD
export const projectCreate = pikkuSessionlessFunc<
  { name: string; description?: string; ownerId: string },
  {
    id: string
    name: string
    description?: string
    ownerId: string
    status: string
    createdAt: string
  }
>({
  title: 'Create Project',
  func: async ({ logger }, data) => {
    logger.info(`Creating project: ${data.name}`)
    return {
      id: `project-${Date.now()}`,
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
  },
})

export const projectGet = pikkuSessionlessFunc<
  { projectId: string },
  {
    id: string
    name: string
    status: string
    ownerId: string
    createdAt: string
  }
>({
  title: 'Get Project',
  func: async ({ logger }, data) => {
    logger.info(`Getting project: ${data.projectId}`)
    return {
      id: data.projectId,
      name: `Project ${data.projectId}`,
      status: 'active',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
    }
  },
})

export const projectUpdate = pikkuSessionlessFunc<
  { projectId: string; name?: string; description?: string; status?: string },
  { id: string; name: string; status: string; updatedAt: string }
>({
  title: 'Update Project',
  func: async ({ logger }, data) => {
    logger.info(`Updating project: ${data.projectId}`)
    return {
      id: data.projectId,
      name: data.name || `Project ${data.projectId}`,
      status: data.status || 'active',
      updatedAt: new Date().toISOString(),
    }
  },
})

export const projectArchive = pikkuSessionlessFunc<
  { projectId: string },
  { id: string; status: string; archivedAt: string }
>({
  title: 'Archive Project',
  func: async ({ logger }, data) => {
    logger.info(`Archiving project: ${data.projectId}`)
    return {
      id: data.projectId,
      status: 'archived',
      archivedAt: new Date().toISOString(),
    }
  },
})

// Project Members
export const projectMemberAdd = pikkuSessionlessFunc<
  { projectId: string; userId: string; role: string },
  { projectId: string; userId: string; role: string; addedAt: string }
>({
  title: 'Add Project Member',
  func: async ({ logger }, data) => {
    logger.info(`Adding member ${data.userId} to project: ${data.projectId}`)
    return {
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
      addedAt: new Date().toISOString(),
    }
  },
})

export const projectMemberRemove = pikkuSessionlessFunc<
  { projectId: string; userId: string },
  { projectId: string; userId: string; removed: boolean }
>({
  title: 'Remove Project Member',
  func: async ({ logger }, data) => {
    logger.info(
      `Removing member ${data.userId} from project: ${data.projectId}`
    )
    return {
      projectId: data.projectId,
      userId: data.userId,
      removed: true,
    }
  },
})

export const projectMemberList = pikkuSessionlessFunc<
  { projectId: string },
  { members: Array<{ userId: string; role: string; addedAt: string }> }
>({
  title: 'List Project Members',
  func: async ({ logger }, data) => {
    logger.info(`Listing members for project: ${data.projectId}`)
    return {
      members: [
        { userId: 'user-1', role: 'owner', addedAt: new Date().toISOString() },
        { userId: 'user-2', role: 'member', addedAt: new Date().toISOString() },
        { userId: 'user-3', role: 'viewer', addedAt: new Date().toISOString() },
      ],
    }
  },
})

export const projectTaskList = pikkuSessionlessFunc<
  { projectId: string; status?: string },
  { tasks: Array<{ id: string; title: string; status: string }> }
>({
  title: 'List Project Tasks',
  func: async ({ logger }, data) => {
    logger.info(`Listing tasks for project: ${data.projectId}`)
    return {
      tasks: [
        { id: 'task-1', title: 'Task 1', status: 'pending' },
        { id: 'task-2', title: 'Task 2', status: 'in_progress' },
        { id: 'task-3', title: 'Task 3', status: 'completed' },
      ],
    }
  },
})
