export interface VariablesService {
  get<T = string>(name: string): Promise<T | undefined> | T | undefined
  getAll: () =>
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined>
  set: (name: string, value: unknown) => Promise<void> | void
  has: (name: string) => Promise<boolean> | boolean
  delete: (name: string) => Promise<void> | void
}
