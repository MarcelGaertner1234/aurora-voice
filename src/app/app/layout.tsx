'use client';

import { AppLayout } from '@/components/layout/app-layout';

export default function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
