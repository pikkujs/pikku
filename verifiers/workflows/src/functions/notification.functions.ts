/**
 * Notification Functions
 * Mock implementations for multi-channel notifications
 */

import { pikkuSessionlessFunc } from '#pikku'

export const notifyEmail = pikkuSessionlessFunc<
  { userId: string; subject: string; body: string },
  {
    id: string
    userId: string
    channel: string
    status: string
    sentAt: string
  }
>({
  title: 'Send Email Notification',
  func: async ({ logger }, data) => {
    logger.info(`Sending email notification to user: ${data.userId}`)
    return {
      id: `notif-email-${Date.now()}`,
      userId: data.userId,
      channel: 'email',
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const notifySMS = pikkuSessionlessFunc<
  { userId: string; message: string },
  {
    id: string
    userId: string
    channel: string
    status: string
    sentAt: string
  }
>({
  title: 'Send SMS Notification',
  func: async ({ logger }, data) => {
    logger.info(`Sending SMS notification to user: ${data.userId}`)
    return {
      id: `notif-sms-${Date.now()}`,
      userId: data.userId,
      channel: 'sms',
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const notifyPush = pikkuSessionlessFunc<
  {
    userId: string
    title: string
    body: string
    data?: Record<string, string>
  },
  {
    id: string
    userId: string
    channel: string
    status: string
    sentAt: string
  }
>({
  title: 'Send Push Notification',
  func: async ({ logger }, data) => {
    logger.info(`Sending push notification to user: ${data.userId}`)
    return {
      id: `notif-push-${Date.now()}`,
      userId: data.userId,
      channel: 'push',
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const notifySlack = pikkuSessionlessFunc<
  { channel: string; message: string; blocks?: Array<Record<string, unknown>> },
  { id: string; channel: string; status: string; sentAt: string }
>({
  title: 'Send Slack Notification',
  func: async ({ logger }, data) => {
    logger.info(`Sending Slack notification to channel: ${data.channel}`)
    return {
      id: `notif-slack-${Date.now()}`,
      channel: data.channel,
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const notifyWebhook = pikkuSessionlessFunc<
  {
    url: string
    payload: Record<string, unknown>
    headers?: Record<string, string>
  },
  {
    id: string
    url: string
    status: string
    responseCode: number
    sentAt: string
  }
>({
  title: 'Send Webhook Notification',
  func: async ({ logger }, data) => {
    logger.info(`Sending webhook notification to: ${data.url}`)
    return {
      id: `notif-webhook-${Date.now()}`,
      url: data.url,
      status: 'sent',
      responseCode: 200,
      sentAt: new Date().toISOString(),
    }
  },
})

export const notifyInApp = pikkuSessionlessFunc<
  { userId: string; title: string; body: string; actionUrl?: string },
  {
    id: string
    userId: string
    channel: string
    status: string
    createdAt: string
  }
>({
  title: 'Send In-App Notification',
  func: async ({ logger }, data) => {
    logger.info(`Creating in-app notification for user: ${data.userId}`)
    return {
      id: `notif-inapp-${Date.now()}`,
      userId: data.userId,
      channel: 'in_app',
      status: 'created',
      createdAt: new Date().toISOString(),
    }
  },
})

export const notifyBatch = pikkuSessionlessFunc<
  { userIds: string[]; channel: string; title: string; body: string },
  { batchId: string; userCount: number; status: string; queuedAt: string }
>({
  title: 'Send Batch Notification',
  func: async ({ logger }, data) => {
    logger.info(
      `Sending batch notification to ${data.userIds.length} users via ${data.channel}`
    )
    return {
      batchId: `batch-${Date.now()}`,
      userCount: data.userIds.length,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    }
  },
})

export const notificationPreferencesGet = pikkuSessionlessFunc<
  { userId: string },
  {
    userId: string
    email: boolean
    sms: boolean
    push: boolean
    slack: boolean
  }
>({
  title: 'Get Notification Preferences',
  func: async ({ logger }, data) => {
    logger.info(`Getting notification preferences for user: ${data.userId}`)
    return {
      userId: data.userId,
      email: true,
      sms: false,
      push: true,
      slack: true,
    }
  },
})

export const digestCollect = pikkuSessionlessFunc<
  { userId: string; since: string },
  {
    userId: string
    items: Array<{ type: string; title: string; createdAt: string }>
  }
>({
  title: 'Collect Digest Items',
  func: async ({ logger }, data) => {
    logger.info(
      `Collecting digest items for user: ${data.userId} since ${data.since}`
    )
    return {
      userId: data.userId,
      items: [
        {
          type: 'task_assigned',
          title: 'New task assigned to you',
          createdAt: new Date().toISOString(),
        },
        {
          type: 'comment_mention',
          title: 'You were mentioned in a comment',
          createdAt: new Date().toISOString(),
        },
        {
          type: 'project_update',
          title: 'Project status changed',
          createdAt: new Date().toISOString(),
        },
      ],
    }
  },
})

export const digestFormat = pikkuSessionlessFunc<
  {
    items: Array<{ type: string; title: string; createdAt: string }>
    format: 'html' | 'text'
  },
  { formatted: string; itemCount: number }
>({
  title: 'Format Digest',
  func: async ({ logger }, data) => {
    logger.info(
      `Formatting ${data.items.length} digest items as ${data.format}`
    )
    const formatted = data.items.map((item) => `- ${item.title}`).join('\n')
    return {
      formatted,
      itemCount: data.items.length,
    }
  },
})
