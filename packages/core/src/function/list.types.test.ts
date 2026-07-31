/**
 * Type-level tests: no runtime assertions — valid shapes must compile and
 * invalid shapes must fail with `@ts-expect-error`. Excluded from `yarn build`
 * via tsconfig's test-file pattern.
 */

import type { ListInput, ListOutput, Filter } from './list.types.js'

type SessionFilter = {
  status?: string[]
  therapistId?: string
  uploadedAt?: string
}
type SessionSort = 'user' | 'status' | 'uploaded_at'

const _basic: ListInput<SessionFilter, SessionSort> = {
  cursor: 'abc',
  limit: 50,
  sort: [
    { column: 'uploaded_at', direction: 'desc' },
    { column: 'status', direction: 'asc' },
  ],
  filter: { status: ['pending'] },
  search: 'sarah',
}
void _basic

const _empty: ListInput = {}
void _empty

// @ts-expect-error — 'created_at' is not in SessionSort
const _badSort: ListInput<SessionFilter, SessionSort> = {
  sort: [{ column: 'created_at', direction: 'asc' }],
}
void _badSort

// @ts-expect-error — 'descending' is not a valid direction
const _badDirection: ListInput<SessionFilter, SessionSort> = {
  sort: [{ column: 'user', direction: 'descending' }],
}
void _badDirection

interface Session {
  id: string
  user: string
  status: string
}

const _output: ListOutput<Session> = {
  rows: [{ id: '1', user: 'sarah', status: 'pending' }],
  nextCursor: null,
  totalCount: 42,
}
void _output

// @ts-expect-error — missing nextCursor
const _badOutput: ListOutput<Session> = {
  rows: [],
}
void _badOutput

const _leafEq: Filter<SessionFilter> = { therapistId: 'kim' }
void _leafEq

const _leafIn: Filter<SessionFilter> = { status: ['pending', 'processed'] }
void _leafIn

const _leafOp: Filter<SessionFilter> = {
  uploadedAt: { gt: '2026-04-10', lte: '2026-04-17' },
}
void _leafOp

const _leafNull: Filter<SessionFilter> = { therapistId: null }
void _leafNull

const _leafNot: Filter<SessionFilter> = { therapistId: { not: 'kim' } }
void _leafNot

const _and: Filter<SessionFilter> = [
  { status: ['pending'] },
  { therapistId: 'kim' },
  { uploadedAt: { gt: '2026-04-10' } },
]
void _and

const _or: Filter<SessionFilter> = {
  viaKim: { therapistId: 'kim' },
  viaPark: { therapistId: 'park' },
}
void _or

const _nested: Filter<SessionFilter> = [
  { status: ['pending'] },
  {
    kim: { therapistId: 'kim' },
    park: { therapistId: 'park' },
  },
  { uploadedAt: { gt: '2026-04-10' } },
]
void _nested
