import { RequireAtLeastOne } from '@pikku/core'

export interface Book {
  id: string
  title: string
  author: string
  year: number
}

export type Books = Book[]
export type JustBookId = Pick<Book, 'id'>
export type CreateBook = Omit<Book, 'id'>
export type UpdateBook = JustBookId & RequireAtLeastOne<CreateBook>
