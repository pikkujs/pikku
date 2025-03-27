import { NextRequest, NextResponse } from 'next/server.js'
import { getSession } from '@pikku/next/pikku-session'
import { CoreSingletonServices } from '@pikku/core'

// 1. Specify protected and public routes
const protectedRoutes = ['/admin']
const publicRoutes = ['/login']

export default async function middleware(req: NextRequest) {
  // 1. Check if the current route is protected or public
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.includes(path)
  const isPublicRoute = publicRoutes.includes(path)

  let userSession
  try {
    // 2. Get the session, this requires middleware to be
    // set
    userSession = await getSession(
      req, // Request
      {} as CoreSingletonServices, // Singleton Services Required by session
      [] // Middleware
    )
  } catch (e) {
    // An error trying to get the user session
    console.error(e)
  }

  // 3. Redirect to / if the user is not authenticated
  if (isProtectedRoute && !userSession) {
    return NextResponse.redirect(new URL('/auth', req.nextUrl))
  }

  // 6. Redirect to / if the user is authenticated
  if (
    isPublicRoute &&
    userSession &&
    req.nextUrl.pathname.startsWith('/auth')
  ) {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }

  return NextResponse.next()
}

// Routes Middleware should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
