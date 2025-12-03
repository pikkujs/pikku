/**
 * The `corePikkuFetch` function is a utility for making HTTP requests with dynamic URI and data handling.
 * It can automatically replace URI parameters, append query strings for GET requests, and set the request body for POST, PATCH, or PUT requests.
 *
 * @param {string} uri - The endpoint URI for the request. URI parameters can be specified using `:param` syntax.
 * @param {any} data - The data to be included in the request, either as query parameters or as the request body.
 * @param {Omit<RequestInit, 'body'>} [options] - Optional configuration options for the fetch request, excluding the body.
 * @returns {Promise<Response>} - A promise that resolves to the response of the fetch request.
 */
export const corePikkuFetch = async (
  uri: string,
  data: any,
  options?: Omit<RequestInit, 'body'>
) => {
  const method = options?.method?.toUpperCase() || 'GET'
  let body: any | undefined

  if (data) {
    data = JSON.parse(JSON.stringify(data))

    const keys = Object.keys(data)
    for (const key of keys) {
      if (uri.includes(`:${key}`)) {
        uri = uri.replace(`:${key}`, data[key])
        delete data[key]
      }
    }
    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
      body = data
    } else {
      const queryString = new URLSearchParams(JSON.parse(JSON.stringify(data)))
      uri = `${uri}?${queryString}`
    }
  }

  const headers = { ...options?.headers } as Record<string, string>
  if (!body) {
    delete headers['Content-Type']
  }

  return await fetch(uri, {
    method: method.toUpperCase(),
    ...options,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}
