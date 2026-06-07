## botshepherd

This folder owns support components for the BotShepherd page.

- `InfoItem.tsx` and `StatCard.tsx` are compact summary display components.
- `ConnRow.tsx` renders one BotShepherd connection row and its row actions.
- `ConnDialog.tsx` handles add, edit, and copy connection forms.
- `AcctDialog.tsx` handles account edit forms.
- `types.ts` stores dialog-only helper types.

`../BotShepherd.tsx` still owns data fetching, lifecycle actions, and page layout. Move additional repeated UI blocks here before expanding the page file.
