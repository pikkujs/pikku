import { MARKER as SQLITE } from '@verifier/fake-sqlite'

export const workerKysely = () => ({ kysely: { driver: SQLITE } })
