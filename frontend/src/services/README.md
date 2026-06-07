## services

Frontend service modules live here.

- `api.ts` is the stable public entrypoint used by pages and components.
- `api/` contains small API client modules grouped by backend domain.
- `operationLogs.ts` owns operation log query and download helpers.

When adding a new backend domain, create a focused file under `api/` and export it from `api/index.ts`. Keep page code importing from `../services/api` unless a more specific helper already exists.
