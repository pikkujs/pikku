export interface VariablesService {
  get: (name: string) => Promise<string | undefined> | string | undefined
  getJSON: <T = unknown>(name: string) => Promise<T | undefined> | T | undefined
  getAll: () =>
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined>
}
