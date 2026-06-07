## alert-settings

This folder owns non-visual Alert Settings support code.

- `constants.ts` stores default form values and SMTP provider presets.
- `types.ts` stores small shared alert types.
- `useAlertSettingsController.ts` owns data loading, dialog state, and alert rule mutations.

`../AlertSettings.tsx` remains the rendering layer. Move new stateful behavior into the controller before adding more JSX to the page file.
