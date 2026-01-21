'use client';

import { ReactNode } from 'react';
import { MeetingSidebar } from './meeting-sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <MeetingSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
