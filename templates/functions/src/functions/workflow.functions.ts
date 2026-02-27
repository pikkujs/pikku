import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { pikkuWorkflowFunc } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import type { Todo, Priority } from '../schemas.js'

/**
 * Helper function: Send notification (mocked).
 */
export const sendNotification = pikkuSessionlessFunc<
  { userId: string; message: string; type?: 'email' | 'push' | 'sms' },
  { sent: boolean; notificationId: string }
>(async ({ logger }, data) => {
  const type = data.type || 'push'
  logger.info(`Sending ${type} notification to ${data.userId}: ${data.message}`)
  return {
    sent: true,
    notificationId: `notif-${Date.now()}`,
  }
})

/**
 * Helper function: Schedule a reminder (via queue).
 */
export const scheduleReminder = pikkuSessionlessFunc<
  { todoId: string; userId: string; remindAt: string },
  { scheduled: boolean; jobId: string }
>(async ({ logger, queueService }, data) => {
  logger.info(`Scheduling reminder for todo ${data.todoId} at ${data.remindAt}`)

  if (queueService) {
    await queueService.add('todo-reminders', {
      todoId: data.todoId,
      userId: data.userId,
      remindAt: data.remindAt,
    })
  }

  return {
    scheduled: true,
    jobId: `job-${Date.now()}`,
  }
})

/**
 * DSL Workflow: Create todo and send notifications.
 */
export const createAndNotifyWorkflow = pikkuWorkflowFunc<
  { userId: string; title: string; priority: Priority; dueDate?: string },
  { todo: Todo; notificationSent: boolean; reminderScheduled: boolean }
>(async ({}, data, { workflow }) => {
  let notificationSent = false
  let reminderScheduled = false
  let notifResult: { sent: boolean; notificationId: string } | undefined
  let reminderResult: { scheduled: boolean; jobId: string } | undefined

  const createResult = await workflow.do('Create todo', 'createTodo', {
    userId: data.userId,
    title: data.title,
    priority: data.priority,
    dueDate: data.dueDate,
    tags: [],
  })
  const todo = createResult.todo

  if (data.priority === 'high') {
    await workflow.sleep('Wait before notification', '1s')
    notifResult = await workflow.do(
      'Send high priority notification',
      'sendNotification',
      {
        userId: data.userId,
        message: `High priority todo created: ${data.title}`,
        type: 'push',
      }
    )
    notificationSent = notifResult!.sent
  }

  if (data.dueDate) {
    reminderResult = await workflow.do(
      'Schedule reminder',
      'scheduleReminder',
      {
        todoId: todo.id,
        userId: data.userId,
        remindAt: data.dueDate,
      }
    )
    reminderScheduled = reminderResult!.scheduled
  }

  return {
    todo,
    notificationSent,
    reminderScheduled,
  }
})

/**
 * Helper for graph workflow: Fetch overdue todos.
 */
export const fetchOverdueTodos = pikkuSessionlessFunc<
  { userId?: string },
  { userId: string; todos: Todo[]; count: number }
>(async ({ logger, todoStore }, data) => {
  const uid = data.userId || 'user1'
  const todos = todoStore.getOverdueTodos(uid)
  logger.info(`Fetched ${todos.length} overdue todos for user ${uid}`)
  return { userId: uid, todos, count: todos.length }
})

/**
 * Helper for graph workflow: Send overdue summary.
 */
export const sendOverdueSummary = pikkuSessionlessFunc<
  { userId: string; overdueCount: number; todos: Todo[] },
  { sent: boolean; message: string }
>(async ({ logger }, data) => {
  const message =
    data.overdueCount > 0
      ? `You have ${data.overdueCount} overdue todo(s): ${data.todos.map((t) => t.title).join(', ')}`
      : 'Great job! No overdue todos.'

  logger.info(`Sending summary to ${data.userId}: ${message}`)

  return { sent: true, message }
})
