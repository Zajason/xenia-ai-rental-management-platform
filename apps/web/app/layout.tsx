import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '../lib/auth-context';
import './globals.css';

export const metadata = {
  title: 'Xenia — Hospitality OS',
  description: 'The AI operating system for hospitality.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: '#111726',
                border: '1px solid #1e2740',
                color: '#e8edf6',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
