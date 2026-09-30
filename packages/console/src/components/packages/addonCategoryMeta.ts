import type { ComponentType } from 'react'
import {
  Package,
  KeyRound,
  CreditCard,
  Database,
  Bot,
  Mail,
  Server,
  TrendingUp,
  Activity,
  Radio,
  Search,
  Wrench,
  MessageCircle,
  Users,
  ShoppingBag,
  Cloud,
  Image,
  Type,
  FileText,
  Phone,
  Landmark,
  LifeBuoy,
  Shield,
  ClipboardList,
} from 'lucide-react'
import type { PackageMeta } from './packageMeta'
import { categoryJob } from './addonJobs'

export interface CategoryMeta {
  icon: ComponentType<{ size?: number }>
  color: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  auth: { icon: KeyRound, color: 'violet' },
  payments: { icon: CreditCard, color: 'green' },
  payment: { icon: CreditCard, color: 'green' },
  financial: { icon: Landmark, color: 'green' },
  messaging: { icon: MessageCircle, color: 'teal' },
  telecom: { icon: Phone, color: 'teal' },
  machine_learning: { icon: Bot, color: 'orange' },
  customer_relation: { icon: Users, color: 'pink' },
  support: { icon: LifeBuoy, color: 'pink' },
  ecommerce: { icon: ShoppingBag, color: 'lime' },
  cloud: { icon: Cloud, color: 'indigo' },
  hosting: { icon: Cloud, color: 'indigo' },
  media: { icon: Image, color: 'grape' },
  text: { icon: Type, color: 'gray' },
  forms: { icon: FileText, color: 'cyan' },
  monitoring: { icon: Activity, color: 'red' },
  security: { icon: Shield, color: 'violet' },
  project_management: { icon: ClipboardList, color: 'blue' },
  collaboration: { icon: Users, color: 'blue' },
  tools: { icon: Wrench, color: 'gray' },
  developer_tools: { icon: Wrench, color: 'gray' },
  database: { icon: Database, color: 'blue' },
  agents: { icon: Bot, color: 'orange' },
  ai: { icon: Bot, color: 'orange' },
  email: { icon: Mail, color: 'cyan' },
  storage: { icon: Server, color: 'grape' },
  analytics: { icon: TrendingUp, color: 'teal' },
  observability: { icon: Activity, color: 'red' },
  observe: { icon: Activity, color: 'red' },
  realtime: { icon: Radio, color: 'cyan' },
  search: { icon: Search, color: 'yellow' },
  devtools: { icon: Wrench, color: 'gray' },
}

export const DEFAULT_CATEGORY_META: CategoryMeta = {
  icon: Package,
  color: 'gray',
}

export function getCategoryMeta(category: string | undefined): CategoryMeta {
  if (!category) return DEFAULT_CATEGORY_META
  return CATEGORY_META[category.toLowerCase()] ?? DEFAULT_CATEGORY_META
}

export function prettyCategory(category: string): string {
  const job = categoryJob(category)
  if (job) return job
  return category.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function isOfficialAddon(name: string): boolean {
  return /^@pikku(fabric)?\//.test(name)
}

export function addonPrimaryCategory(addon: PackageMeta): string | undefined {
  return addon.categories?.[0]
}

export interface CategoryBucket {
  id: string
  label: string
  count: number
}

/**
 * Shape the registry's catalogue-wide category counts for the rail.
 *
 * Note these count every category a package declares, matching how the
 * category filter itself matches (any category, not just the first). The old
 * client-side derivation counted only `categories[0]`, so a multi-category
 * package appeared under one heading but was returned by the filter for
 * several — the counts and the filter now agree.
 */
export function toCategoryBuckets(
  counts: Record<string, number>
): CategoryBucket[] {
  return Object.entries(counts)
    .filter(([id]) => !!id)
    .map(([id, count]) => ({ id, label: prettyCategory(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function deriveCategories(addons: PackageMeta[]): CategoryBucket[] {
  const counts = new Map<string, number>()
  for (const addon of addons) {
    const cat = addonPrimaryCategory(addon)
    if (!cat) continue
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: prettyCategory(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
