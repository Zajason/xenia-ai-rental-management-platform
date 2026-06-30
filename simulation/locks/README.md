# simulation/locks

The simulated smart-lock provider (`lock-provider.ts`) implementing the shared
`LockProvider` interface, with injectable failures (offline, low battery, denied)
so the access-credential lifecycle and the reconciliation job can be demoed and
tested without hardware. The real Seam adapter implements the same interface.
