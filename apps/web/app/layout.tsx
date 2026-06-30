import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Xenia — Hospitality OS',
  description: 'The AI operating system for hospitality.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
