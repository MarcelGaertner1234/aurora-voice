import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppLayout } from '@/components/layout/app-layout';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Aurora Voice',
  description: 'Transform voice into intelligent, structured outputs',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
