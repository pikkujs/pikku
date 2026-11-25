import { MARKER as PG } from '@verifier/fake-pg'

export const containerKysely = () => ({ kysely: { driver: PG } })
