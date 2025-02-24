import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Simple App',
  description: 'A simple app to show how to integrate nextjs with pikku',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
