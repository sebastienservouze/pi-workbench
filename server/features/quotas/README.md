# Quotas backend capability

`QuotaService` coordinates manager commands, concurrent refresh deduplication, restart restoration, and session availability. `QuotaCache` validates the versioned extension status payload and retains the last valid provider data when a refresh fails.

HTTP paths and session identifier validation remain in `server/backend.ts`. Pi communication always uses `ManagerClient`. Main coverage: `test/quotas.test.ts`.
