/**
 * Type-level tests for list-function primitives.
 *
 * No runtime assertions — the point is that valid shapes compile and
 * invalid shapes fail with `@ts-expect-error`. The file is excluded
 * from `yarn build` via tsconfig's `**∕*.test.ts` pattern.
 */

import type { ListInput, ListOutput, Filter } from './list.types.js'

// -- ListInput ---------------------------------------------------------------

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

// sort.column must be from the declared union
// @ts-expect-error — 'created_at' is not in SessionSort
const _badSort: ListInput<SessionFilter, SessionSort> = {
  sort: [{ column: 'created_at', direction: 'asc' }],
}
void _badSort

// sort.direction must be 'asc' or 'desc'
// @ts-expect-error — 'descending' is not a valid direction
const _badDirection: ListInput<SessionFilter, SessionSort> = {
  sort: [{ column: 'user', direction: 'descending' }],
}
void _badDirection

// -- ListOutput --------------------------------------------------------------

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

// nextCursor is required (must be string or null, not undefined-only)
// @ts-expect-error — missing nextCursor
const _badOutput: ListOutput<Session> = {
  rows: [],
}
void _badOutput

// -- Filter: leaves ----------------------------------------------------------

// Simple equality
const _leafEq: Filter<SessionFilter> = { therapistId: 'kim' }
void _leafEq

// Array = IN shorthand
const _leafIn: Filter<SessionFilter> = { status: ['pending', 'processed'] }
void _leafIn

// Operator object
const _leafOp: Filter<SessionFilter> = {
  uploadedAt: { gt: '2026-04-10', lte: '2026-04-17' },
}
void _leafOp

// Null = IS NULL
const _leafNull: Filter<SessionFilter> = { therapistId: null }
void _leafNull

// NOT on a value
const _leafNot: Filter<SessionFilter> = { therapistId: { not: 'kim' } }
void _leafNot

// -- Filter: AND (array) -----------------------------------------------------

const _and: Filter<SessionFilter> = [
  { status: ['pending'] },
  { therapistId: 'kim' },
  { uploadedAt: { gt: '2026-04-10' } },
]
void _and

// -- Filter: OR (object with arbitrary label keys) --------------------------

const _or: Filter<SessionFilter> = {
  viaKim: { therapistId: 'kim' },
  viaPark: { therapistId: 'park' },
}
void _or

// -- Filter: nested AND/OR ---------------------------------------------------

const _nested: Filter<SessionFilter> = [
  { status: ['pending'] },
  {
    kim: { therapistId: 'kim' },
    park: { therapistId: 'park' },
  },
  { uploadedAt: { gt: '2026-04-10' } },
]
void _nested
