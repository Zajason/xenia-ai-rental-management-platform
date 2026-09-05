import type { ReactNode } from 'react';
import { CalendarCheck2, KeyRound, MessageCircleHeart, Sparkles } from 'lucide-react';

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: 'One calendar, every channel',
    body: 'Airbnb, Booking.com and direct bookings reconciled automatically — double-bookings are structurally impossible.',
  },
  {
    icon: Sparkles,
    title: 'An AI concierge that knows your properties',
    body: 'Guests get instant, accurate answers grounded in the house manual you write once.',
  },
  {
    icon: KeyRound,
    title: 'Access codes that expire themselves',
    body: 'Door codes activate at check-in and revoke at checkout — no manual handoffs.',
  },
  {
    icon: MessageCircleHeart,
    title: 'Every task, in one place',
    body: 'Cleaning, maintenance, pricing and payouts — coordinated, not scattered across group chats.',
  },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0d1424] via-[#0a0e17] to-[#120f22] p-12 lg:flex">
        <div
          className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-accent/20 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 right-0 size-96 rounded-full bg-purple/10 blur-[120px]"
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple text-[16px] font-bold text-[#08101f]">
            X
          </div>
          <span className="text-[17px] font-semibold tracking-tight">Xenia</span>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-[32px] font-semibold leading-tight tracking-tight text-text">
            The operating system for hospitality.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            Bookings, cleaning, maintenance, pricing and an AI concierge — coordinated
            automatically across every property you run.
          </p>

          <div className="mt-10 flex flex-col gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-lg border border-border-strong bg-surface text-accent">
                  <f.icon className="size-4" />
                </div>
                <div>
                  <p className="text-[13.5px] font-medium text-text">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[12px] text-faint">Named for the ancient Greek art of hospitality.</p>
      </div>

      <div className="flex items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-purple text-[14px] font-bold text-[#08101f]">
              X
            </div>
            <span className="text-[16px] font-semibold tracking-tight">Xenia</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
