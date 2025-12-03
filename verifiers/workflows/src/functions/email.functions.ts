/**
 * Email Functions
 * Mock implementations for email sending and verification
 */

import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

export const emailSend = pikkuSessionlessFunc<
  { to: string; subject: string; body: string; from?: string },
  { id: string; to: string; subject: string; status: string; sentAt: string }
>({
  title: 'Send Email',
  func: async ({ logger }, data) => {
    logger.info(`Sending email to: ${data.to}, subject: ${data.subject}`)
    return {
      id: `email-${Date.now()}`,
      to: data.to,
      subject: data.subject,
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const emailSendBulk = pikkuSessionlessFunc<
  { recipients: string[]; subject: string; body: string; from?: string },
  { id: string; recipientCount: number; status: string; sentAt: string }
>({
  title: 'Send Bulk Email',
  func: async ({ logger }, data) => {
    logger.info(`Sending bulk email to ${data.recipients.length} recipients`)
    return {
      id: `bulk-email-${Date.now()}`,
      recipientCount: data.recipients.length,
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const emailSendTemplate = pikkuSessionlessFunc<
  { to: string; templateId: string; variables: Record<string, string> },
  { id: string; to: string; templateId: string; status: string; sentAt: string }
>({
  title: 'Send Template Email',
  func: async ({ logger }, data) => {
    logger.info(
      `Sending template email to: ${data.to}, template: ${data.templateId}`
    )
    return {
      id: `email-${Date.now()}`,
      to: data.to,
      templateId: data.templateId,
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
  },
})

export const emailVerify = pikkuSessionlessFunc<
  { email: string },
  { email: string; valid: boolean; deliverable: boolean; reason?: string }
>({
  title: 'Verify Email',
  func: async ({ logger }, data) => {
    logger.info(`Verifying email: ${data.email}`)
    const valid = data.email.includes('@') && data.email.includes('.')
    return {
      email: data.email,
      valid,
      deliverable: valid,
      reason: valid ? undefined : 'Invalid email format',
    }
  },
})

export const emailGetStatus = pikkuSessionlessFunc<
  { emailId: string },
  {
    id: string
    status: string
    openedAt?: string
    clickedAt?: string
    bouncedAt?: string
  }
>({
  title: 'Get Email Status',
  func: async ({ logger }, data) => {
    logger.info(`Getting email status: ${data.emailId}`)
    return {
      id: data.emailId,
      status: 'delivered',
      openedAt: new Date().toISOString(),
    }
  },
})

export const emailSchedule = pikkuSessionlessFunc<
  { to: string; subject: string; body: string; sendAt: string },
  {
    id: string
    to: string
    subject: string
    status: string
    scheduledFor: string
  }
>({
  title: 'Schedule Email',
  func: async ({ logger }, data) => {
    logger.info(`Scheduling email to: ${data.to} for ${data.sendAt}`)
    return {
      id: `email-${Date.now()}`,
      to: data.to,
      subject: data.subject,
      status: 'scheduled',
      scheduledFor: data.sendAt,
    }
  },
})
