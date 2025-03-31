import { HTTPMethod } from '@pikku/core/http'
import { cookies, headers as nextHeaders } from 'next/headers.js'

/**
 * Converts the given parameters into a standard Request.
 * Retrieves cookies and headers dynamically using Next’s APIs.
 *
 * @param route - The URL or route.
 * @param method - The HTTP method.
 * @param body - The request body.
 * @returns A Promise resolving to a Request.
 */
export async function convertActionNextRequestDynamic(
  route: string,
  method: HTTPMethod,
  body: any
): Promise<Request> {
  // Create a URL using a dummy base.
  const url = new URL(route, 'http://ignore-this.com')

  // Retrieve headers using Next’s headers() API.
  const headerStore = await nextHeaders()
  // headerStore is an instance of Headers (or similar iterable), so copy its entries.
  const dynamicHeaders = new Headers(headerStore)

  // Merge cookies into the headers.
  // Retrieve cookies using Next’s cookies() API.
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  // Build a cookie header string.
  const cookieHeader =
    allCookies.length > 0
      ? allCookies.map(({ name, value }) => `${name}=${value}`).join('; ')
      : ''
  if (cookieHeader) {
    dynamicHeaders.set('cookie', cookieHeader)
  }

  return new Request(url.toString(), {
    method: method.toUpperCase(),
    headers: dynamicHeaders,
    body,
  })
}

/**
 * Converts the given parameters into a standard Request.
 * Retrieves cookies and headers dynamically using Next’s APIs.
 *
 * @param route - The URL or route.
 * @param method - The HTTP method.
 * @param body - The request body.
 * @returns A Promise resolving to a Request.
 */
export async function convertActionNextRequestStatic(
  route: string,
  method: HTTPMethod,
  body: any
): Promise<Request> {
  // Create a URL using a dummy base.
  const url = new URL(route, 'http://ignore-this.com')

  return new Request(url.toString(), {
    method: method.toUpperCase(),
    headers: {},
    body,
  })
}
