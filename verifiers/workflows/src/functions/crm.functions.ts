/**
 * CRM Functions
 * Mock implementations for leads, deals, and contacts
 */

import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Leads
export const leadCreate = pikkuSessionlessFunc<
  { email: string; name: string; source: string; company?: string },
  {
    id: string
    email: string
    name: string
    source: string
    company?: string
    status: string
    createdAt: string
  }
>(async ({ logger }, data) => {
  logger.info(`Creating lead: ${data.email}`)
  return {
    id: `lead-${Date.now()}`,
    email: data.email,
    name: data.name,
    source: data.source,
    company: data.company,
    status: 'new',
    createdAt: new Date().toISOString(),
  }
})

export const leadGet = pikkuSessionlessFunc<
  { leadId: string },
  {
    id: string
    email: string
    name: string
    source: string
    company?: string
    status: string
    score?: number
  }
>(async ({ logger }, data) => {
  logger.info(`Getting lead: ${data.leadId}`)
  return {
    id: data.leadId,
    email: 'lead@example.com',
    name: 'John Doe',
    source: 'website',
    company: 'Acme Corp',
    status: 'qualified',
    score: 75,
  }
})

export const leadScore = pikkuSessionlessFunc<
  {
    leadId: string
    criteria: {
      hasEmail: boolean
      hasCompany: boolean
      engagementLevel: string
    }
  },
  {
    leadId: string
    score: number
    factors: Array<{ name: string; points: number }>
  }
>(async ({ logger }, data) => {
  logger.info(`Scoring lead: ${data.leadId}`)
  const factors: Array<{ name: string; points: number }> = []
  let score = 0
  if (data.criteria.hasEmail) {
    factors.push({ name: 'has_email', points: 20 })
    score += 20
  }
  if (data.criteria.hasCompany) {
    factors.push({ name: 'has_company', points: 30 })
    score += 30
  }
  if (data.criteria.engagementLevel === 'high') {
    factors.push({ name: 'high_engagement', points: 50 })
    score += 50
  } else if (data.criteria.engagementLevel === 'medium') {
    factors.push({ name: 'medium_engagement', points: 25 })
    score += 25
  }
  return {
    leadId: data.leadId,
    score,
    factors,
  }
})

export const leadAssign = pikkuSessionlessFunc<
  { leadId: string; salesRepId: string },
  { leadId: string; salesRepId: string; assignedAt: string }
>(async ({ logger }, data) => {
  logger.info(`Assigning lead ${data.leadId} to sales rep: ${data.salesRepId}`)
  return {
    leadId: data.leadId,
    salesRepId: data.salesRepId,
    assignedAt: new Date().toISOString(),
  }
})

export const leadReject = pikkuSessionlessFunc<
  { leadId: string; reason: string },
  { leadId: string; status: string; rejectedAt: string; reason: string }
>(async ({ logger }, data) => {
  logger.info(`Rejecting lead ${data.leadId}: ${data.reason}`)
  return {
    leadId: data.leadId,
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    reason: data.reason,
  }
})

// Deals
export const dealCreate = pikkuSessionlessFunc<
  { leadId: string; title: string; value: number; currency: string },
  {
    id: string
    leadId: string
    title: string
    value: number
    currency: string
    stage: string
    createdAt: string
  }
>(async ({ logger }, data) => {
  logger.info(`Creating deal from lead: ${data.leadId}`)
  return {
    id: `deal-${Date.now()}`,
    leadId: data.leadId,
    title: data.title,
    value: data.value,
    currency: data.currency,
    stage: 'qualification',
    createdAt: new Date().toISOString(),
  }
})

export const dealUpdate = pikkuSessionlessFunc<
  { dealId: string; title?: string; value?: number; stage?: string },
  { id: string; title: string; value: number; stage: string; updatedAt: string }
>(async ({ logger }, data) => {
  logger.info(`Updating deal: ${data.dealId}`)
  return {
    id: data.dealId,
    title: data.title || 'Updated Deal',
    value: data.value || 10000,
    stage: data.stage || 'qualification',
    updatedAt: new Date().toISOString(),
  }
})

export const dealStageMove = pikkuSessionlessFunc<
  { dealId: string; fromStage: string; toStage: string },
  { dealId: string; previousStage: string; newStage: string; movedAt: string }
>(async ({ logger }, data) => {
  logger.info(
    `Moving deal ${data.dealId} from ${data.fromStage} to ${data.toStage}`
  )
  return {
    dealId: data.dealId,
    previousStage: data.fromStage,
    newStage: data.toStage,
    movedAt: new Date().toISOString(),
  }
})

export const dealGet = pikkuSessionlessFunc<
  { dealId: string },
  {
    id: string
    title: string
    value: number
    currency: string
    stage: string
    probability: number
  }
>(async ({ logger }, data) => {
  logger.info(`Getting deal: ${data.dealId}`)
  return {
    id: data.dealId,
    title: 'Enterprise License',
    value: 50000,
    currency: 'USD',
    stage: 'proposal',
    probability: 60,
  }
})

// Contacts
export const contactGet = pikkuSessionlessFunc<
  { contactId: string },
  {
    id: string
    email: string
    name: string
    company?: string
    phone?: string
    linkedIn?: string
  }
>(async ({ logger }, data) => {
  logger.info(`Getting contact: ${data.contactId}`)
  return {
    id: data.contactId,
    email: 'contact@example.com',
    name: 'Jane Smith',
    company: 'Tech Corp',
    phone: '+1234567890',
  }
})

export const contactEnrich = pikkuSessionlessFunc<
  { contactId: string; email: string },
  {
    contactId: string
    enrichedData: {
      company: string
      title: string
      linkedIn: string
      industry: string
    }
  }
>(async ({ logger }, data) => {
  logger.info(`Enriching contact: ${data.contactId}`)
  return {
    contactId: data.contactId,
    enrichedData: {
      company: 'Tech Corp',
      title: 'VP of Engineering',
      linkedIn: 'https://linkedin.com/in/janesmith',
      industry: 'Technology',
    },
  }
})

export const contactUpdate = pikkuSessionlessFunc<
  { contactId: string; data: Record<string, string> },
  { contactId: string; updated: boolean; updatedAt: string }
>(async ({ logger }, data) => {
  logger.info(`Updating contact: ${data.contactId}`)
  return {
    contactId: data.contactId,
    updated: true,
    updatedAt: new Date().toISOString(),
  }
})
