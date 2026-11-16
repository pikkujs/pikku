/** `statusCode` -> `status_code`; consecutive capitals stay one word (`HTTPLog` -> `httplog`), as the database holds them. */
export const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
