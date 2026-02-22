export interface VariablesService {
  get: (name: string) => Promise<string | undefined> | string | undefined
  getJSON: <T = unknown>(name: string) => Promise<T | undefined> | T | undefined
  getAll: () =>
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined>
  set: (name: string, value: string) => Promise<void> | void
  setJSON: (name: string, value: unknown) => Promise<void> | void
  has: (name: string) => Promise<boolean> | boolean
  delete: (name: string) => Promise<void> | void
}
