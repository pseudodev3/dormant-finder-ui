import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dormant Wallet Explorer',
  description: 'High-value EVM wallet discovery',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
