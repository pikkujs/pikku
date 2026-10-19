'use client';

import { Books, CreateBook } from "@/backend/books.types.js";

export const BookList: React.FunctionComponent<{ books: Books, addBook: (book: CreateBook) => void, deleteBook: (id: string) => void }> = ({ books, deleteBook }) => {
    return <div>
        <ul className='flex flex-col gap-2 p-4'>
            {books.map(book => <li key={book.id} className='flex flex-col gap-2 border rounded p-2'>
                <div>{book.title}</div>
                <small>By: {book.author}</small>
                <button className="text-left text-sm underline" onClick={() => deleteBook(book.id)}>delete</button>
            </li>)}
        </ul>
    </div>
}