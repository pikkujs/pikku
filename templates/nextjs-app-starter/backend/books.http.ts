import { addHTTPRoute } from '@pikku/core'

import type { UpdateBook, CreateBook, JustBookId, Books, Book } from './books.types.js'
import { pikkuSessionlessFunc } from './.pikku/pikku-types.gen.js'

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/books',
  func: pikkuSessionlessFunc<void, Books>(async (services) => services.books.getBooks())
})

addHTTPRoute({
  auth: false,
  method: 'post',
  route: '/book',
  func: pikkuSessionlessFunc<CreateBook, Book>(async (services, book) => services.books.createBook(book))
})

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/book/:id',
  func: pikkuSessionlessFunc<JustBookId, Book>(async (services, book) => services.books.getBook(book.id))
})

addHTTPRoute({
  auth: false,
  method: 'patch',
  route: '/book/:id',
  func: pikkuSessionlessFunc<UpdateBook, Book>(async (services, book) => services.books.updateBook(book.id, book))
})

addHTTPRoute({
  auth: false,
  method: 'delete',
  route: '/book/:id',
  func: pikkuSessionlessFunc<JustBookId, boolean>(async (services, book) => services.books.deleteBook(book.id))
})
