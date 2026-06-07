## components

Reusable frontend components live here.

Feature-specific component folders should include their own README when they contain more than one file. Current examples:

- `bot-manager/` owns Bot chat and group management panels.
- Shared single-file components such as `Toast.tsx`, `FileManager.tsx`, and `NetworkConfig.tsx` remain here until they need further splitting.

When a shared component grows beyond one workflow, create a sibling folder and keep the existing import path as a compatibility wrapper.
