export type Status = 'open' | 'closed'
export interface Item {
  id: string
  name: string
  price: number
  status: Status
  note: string | null
  createdAt: Date
  tags?: string[]
  attributes: Record<string, string>
  owner?: Owner
  kind: 'item'
}
export interface Owner {
  name: string
  manager?: { name: string }
}
export interface ItemList {
  items: Item[]
  total: number
  /** @minimum 0 @maximum 100 */
  page: number
}
export type SearchResult =
  { kind: 'item'; item: Item } | { kind: 'none'; reason: string }
export interface CreateItemInput {
  name: string
  price: number
  tags?: string[]
}
