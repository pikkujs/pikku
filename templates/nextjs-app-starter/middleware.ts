import { getSession } from '@pikku/next/pikku-session'
import { NextRequest, NextResponse } from 'next/server.js'
import { SingletonServices, UserSession } from './backend/application-types.js'

// 1. Specify protected and public routes
const protectedRoutes: string[] = []
const publicRoutes: string[] = ['/books', '/']

export default async function middleware(req: NextRequest) {
  // 1. Check if the current route is protected or public
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.includes(path)
  const isPublicRoute = publicRoutes.includes(path)

  let userSession
  try {
    // We would assign the middleware we care about
    // here in order to get the user session
    userSession = await getSession<UserSession>(
      req,
      {} as SingletonServices, // Singleton Services Required by session
      []
    )
  } catch (e) {
    console.error(e)
  }

  // 3. Redirect to /login if the user is not authenticated
  if (isProtectedRoute && !userSession?.userId) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  // 6. Redirect to /books if the user is authenticated
  if (
    isPublicRoute &&
    userSession?.userId &&
    !req.nextUrl.pathname.startsWith('/books')
  ) {
    return NextResponse.redirect(new URL('/books', req.nextUrl))
  }

  return NextResponse.next()
}

// Routes Middleware should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
