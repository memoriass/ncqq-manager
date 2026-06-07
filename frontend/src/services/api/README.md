## api

This folder splits the frontend API client by backend domain.

- `client.ts` owns shared `fetch` behavior, auth error handling, and the API base path.
- `types.ts` exports shared DTO types used by multiple clients.
- `containerApi.ts`, `nodeApi.ts`, `userApi.ts`, `alertApi.ts`, and similar files own one backend domain each.
- `index.ts` re-exports the public surface consumed by `../api.ts`.

For model-assisted changes, read `client.ts`, `types.ts`, then only the domain client relevant to the feature.
