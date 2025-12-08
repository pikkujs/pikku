/**
 * Task Management Functions
 * Mock implementations for task CRUD, comments, tags, and subtasks
 */

import { pikkuSessionlessFunc } from '#pikku'

// Task CRUD
export const taskCreate = pikkuSessionlessFunc<
  {
    title: string
    description?: string
    projectId?: string
    assigneeId?: string
  },
  {
    id: string
    title: string
    description?: string
    projectId?: string
    assigneeId?: string
    status: string
    createdAt: string
  }
>({
  title: 'Create Task',
  func: async ({ logger }, data) => {
    logger.info(`Creating task: ${data.title}`)
    return {
      id: `task-${Date.now()}`,
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      assigneeId: data.assigneeId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const taskGet = pikkuSessionlessFunc<
  { taskId: string },
  { id: string; title: string; status: string; createdAt: string }
>({
  title: 'Get Task',
  func: async ({ logger }, data) => {
    logger.info(`Getting task: ${data.taskId}`)
    return {
      id: data.taskId,
      title: `Task ${data.taskId}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const taskUpdate = pikkuSessionlessFunc<
  {
    taskId: string
    title?: string
    description?: string
    status?: string
    assigneeId?: string
  },
  { id: string; title: string; status: string; updatedAt: string }
>({
  title: 'Update Task',
  func: async ({ logger }, data) => {
    logger.info(`Updating task: ${data.taskId}`)
    return {
      id: data.taskId,
      title: data.title || `Task ${data.taskId}`,
      status: data.status || 'pending',
      updatedAt: new Date().toISOString(),
    }
  },
})

export const taskDelete = pikkuSessionlessFunc<
  { taskId: string },
  { deleted: boolean; taskId: string }
>({
  title: 'Delete Task',
  func: async ({ logger }, data) => {
    logger.info(`Deleting task: ${data.taskId}`)
    return {
      deleted: true,
      taskId: data.taskId,
    }
  },
})

export const taskList = pikkuSessionlessFunc<
  { projectId?: string; status?: string; limit?: number },
  { tasks: Array<{ id: string; title: string; status: string }> }
>({
  title: 'List Tasks',
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

// Task Comments
export const taskCommentAdd = pikkuSessionlessFunc<
  { taskId: string; content: string; authorId: string },
  {
    id: string
    taskId: string
    content: string
    authorId: string
    createdAt: string
  }
>({
  title: 'Add Task Comment',
  func: async ({ logger }, data) => {
    logger.info(`Adding comment to task: ${data.taskId}`)
    return {
      id: `comment-${Date.now()}`,
      taskId: data.taskId,
      content: data.content,
      authorId: data.authorId,
      createdAt: new Date().toISOString(),
    }
  },
})

export const taskCommentList = pikkuSessionlessFunc<
  { taskId: string },
  {
    comments: Array<{
      id: string
      content: string
      authorId: string
      createdAt: string
    }>
  }
>({
  title: 'List Task Comments',
  func: async ({ logger }, data) => {
    logger.info(`Listing comments for task: ${data.taskId}`)
    return {
      comments: [
        {
          id: 'comment-1',
          content: 'First comment',
          authorId: 'user-1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'comment-2',
          content: 'Second comment',
          authorId: 'user-2',
          createdAt: new Date().toISOString(),
        },
      ],
    }
  },
})

export const taskCommentRemove = pikkuSessionlessFunc<
  { taskId: string; commentId: string },
  { deleted: boolean; commentId: string }
>({
  title: 'Remove Task Comment',
  func: async ({ logger }, data) => {
    logger.info(`Removing comment ${data.commentId} from task: ${data.taskId}`)
    return {
      deleted: true,
      commentId: data.commentId,
    }
  },
})

// Task Tags
export const taskTagAdd = pikkuSessionlessFunc<
  { taskId: string; tag: string },
  { taskId: string; tag: string; added: boolean }
>({
  title: 'Add Task Tag',
  func: async ({ logger }, data) => {
    logger.info(`Adding tag ${data.tag} to task: ${data.taskId}`)
    return {
      taskId: data.taskId,
      tag: data.tag,
      added: true,
    }
  },
})

export const taskTagRemove = pikkuSessionlessFunc<
  { taskId: string; tag: string },
  { taskId: string; tag: string; removed: boolean }
>({
  title: 'Remove Task Tag',
  func: async ({ logger }, data) => {
    logger.info(`Removing tag ${data.tag} from task: ${data.taskId}`)
    return {
      taskId: data.taskId,
      tag: data.tag,
      removed: true,
    }
  },
})

// Subtasks
export const subtaskCreate = pikkuSessionlessFunc<
  { parentTaskId: string; title: string },
  {
    id: string
    parentTaskId: string
    title: string
    status: string
    createdAt: string
  }
>({
  title: 'Create Subtask',
  func: async ({ logger }, data) => {
    logger.info(`Creating subtask for task: ${data.parentTaskId}`)
    return {
      id: `subtask-${Date.now()}`,
      parentTaskId: data.parentTaskId,
      title: data.title,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const subtaskList = pikkuSessionlessFunc<
  { parentTaskId: string },
  { subtasks: Array<{ id: string; title: string; status: string }> }
>({
  title: 'List Subtasks',
  func: async ({ logger }, data) => {
    logger.info(`Listing subtasks for task: ${data.parentTaskId}`)
    return {
      subtasks: [
        { id: 'subtask-1', title: 'Subtask 1', status: 'pending' },
        { id: 'subtask-2', title: 'Subtask 2', status: 'completed' },
      ],
    }
  },
})
