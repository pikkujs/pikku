import { Book, Books, CreateBook } from './books.types.js'
import { NotFoundError } from '@pikku/core/errors'

/**
 * Service for managing books with basic CRUD operations.
 */
export class BookService {
  private books = new Map<string, Book>()
  private nextId: number = 1

  /**
   * Creates a new book and adds it to the collection.
   * @param title - The title of the book.
   * @param author - The author of the book.
   * @param year - The year the book was published.
   * @returns The newly created book.
   */
  createBook(book: CreateBook): Book {
    const newBook: Book = { id: (this.nextId++).toString(), ...book }
    this.books.set(newBook.id, newBook)
    return newBook
  }

  /**
   * Retrieves a book by its unique ID.
   * @param id - The ID of the book to retrieve.
   * @returns The book object if found, or `undefined` if no book exists with the given ID.
   */
  getBook(id: string): Book {
    const book = this.books.get(id)
    if (book) {
      return book
    }
    throw new NotFoundError(`Book with ID ${id} not found`)
  }

  /**
   * Retrieves the list of all books in the collection.
   * @returns An array of all books.
   */
  getBooks(): Books {
    return [...this.books.values()]
  }

  /**
   * Updates the properties of a book with the given ID.
   * Only the provided fields in `updatedInfo` will be changed.
   * @param id - The ID of the book to update.
   * @param updatedInfo - An object containing the fields to update (e.g., `title`, `author`, `year`).
   * @returns The updated book object if the book exists, or throws a `NotFoundError` otherwise.
   */
  updateBook(id: string, updatedInfo: Partial<Omit<Book, 'id'>>): Book {
    const book = this.getBook(id)
    if (book) {
      this.books.set(id, { ...book, ...updatedInfo })
      return book
    }
    throw new NotFoundError(`Book with ID ${id} not found`)
  }

  /**
   * Updates the properties of a book with the given ID.
   * Only the provided fields in `updatedInfo` will be changed.
   * @param id - The ID of the book to update.
   * @param updatedInfo - An object containing the fields to update (e.g., `title`, `author`, `year`).
   */
  deleteBook(id: string): boolean {
    return this.books.delete(id)
  }
}
