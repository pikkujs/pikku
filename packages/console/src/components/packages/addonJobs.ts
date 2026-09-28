import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'

export const POPULAR_ADDONS: { name: string; job: () => I18nString }[] = [
  { name: '@pikku/addon-stripe', job: m.integrations_job_stripe },
  { name: '@pikku/addon-resend', job: m.integrations_job_resend },
  {
    name: '@pikku/addon-google-calendar',
    job: m.integrations_job_google_calendar,
  },
  { name: '@pikku/addon-openai', job: m.integrations_job_openai },
  { name: '@pikku/addon-whatsapp', job: m.integrations_job_whatsapp },
  { name: '@pikku/addon-twilio', job: m.integrations_job_twilio },
  { name: '@pikku/addon-slack', job: m.integrations_job_slack },
  { name: '@pikku/addon-mailchimp', job: m.integrations_job_mailchimp },
  { name: '@pikku/addon-hubspot', job: m.integrations_job_hubspot },
  { name: '@pikku/addon-aws-s3', job: m.integrations_job_aws_s3 },
  { name: '@pikku/addon-shopify', job: m.integrations_job_shopify },
  { name: '@pikku/addon-notion', job: m.integrations_job_notion },
]

export const POPULAR_NAMES = POPULAR_ADDONS.map((p) => p.name)

export const addonJob = (name: string): I18nString | undefined =>
  POPULAR_ADDONS.find((p) => p.name === name)?.job()

const CATEGORY_JOBS: Record<string, () => I18nString> = {
  payment: m.integrations_cat_payment,
  email: m.integrations_cat_email,
  messaging: m.integrations_cat_messaging,
  machine_learning: m.integrations_cat_machine_learning,
  storage: m.integrations_cat_storage,
  customer_relation: m.integrations_cat_customer_relation,
  ecommerce: m.integrations_cat_ecommerce,
  analytics: m.integrations_cat_analytics,
  forms: m.integrations_cat_forms,
  media: m.integrations_cat_media,
  text: m.integrations_cat_text,
  monitoring: m.integrations_cat_monitoring,
  tools: m.integrations_cat_tools,
  developer_tools: m.integrations_cat_developer_tools,
  cloud: m.integrations_cat_cloud,
  database: m.integrations_cat_database,
  search: m.integrations_cat_search,
  hosting: m.integrations_cat_hosting,
  collaboration: m.integrations_cat_collaboration,
  enterprise: m.integrations_cat_enterprise,
  financial: m.integrations_cat_financial,
  support: m.integrations_cat_support,
  security: m.integrations_cat_security,
  project_management: m.integrations_cat_project_management,
  telecom: m.integrations_cat_telecom,
}

export const categoryJob = (id: string): I18nString | undefined =>
  CATEGORY_JOBS[id.toLowerCase()]?.()

export const QUICK_JOBS = [
  'payment',
  'email',
  'messaging',
  'machine_learning',
  'storage',
  'customer_relation',
  'ecommerce',
]
