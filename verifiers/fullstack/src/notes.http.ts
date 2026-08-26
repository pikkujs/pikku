import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/http'
import { createNote, listNotes } from './notes.functions.js'

const noteRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['notes'],
  routes: {
    list: { method: 'get', route: '/notes', func: listNotes },
    create: { method: 'post', route: '/notes', func: createNote },
  },
})

wireHTTPRoutes({ routes: { notes: noteRoutes } })
