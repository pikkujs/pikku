import type { NextRequest } from 'next/server.js'
import { NextResponse } from 'next/server.js'
import { getSession } from '@pikku/next/pikku-session'
import type { CoreSingletonServices } from '@pikku/core'

const protectedRoutes = ['/admin']
const publicRoutes = ['/login']

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.includes(path)
  const isPublicRoute = publicRoutes.includes(path)

  let userSession
  try {
    userSession = await getSession(req, {} as CoreSingletonServices, [])
  } catch (e) {
    console.error(e)
  }

  if (isProtectedRoute && !userSession) {
    return NextResponse.redirect(new URL('/auth', req.nextUrl))
  }

  if (
    isPublicRoute &&
    userSession &&
    req.nextUrl.pathname.startsWith('/auth')
  ) {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
