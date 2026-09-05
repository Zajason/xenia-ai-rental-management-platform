import { Loader2 } from 'lucide-react';

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple text-[15px] font-bold text-[#08101f]">
          X
        </div>
        <Loader2 className="size-5 animate-spin text-muted" />
      </div>
    </div>
  );
}
