// The source project's kysely schema. Carved DB addons scope themselves to a
// subset of these tables via the compile-oracle — e.g. the `dbpost` addon owns
// only `post` + `user`, never `auditLog` (used by an un-carved function).
export interface DB {
  user: { id: string; email: string; name: string }
  post: { id: string; title: string; authorId: string; published: boolean }
  auditLog: { id: string; action: string; at: string }
}
