## pages

Top-level route pages live here.

Large pages should keep only route-level state, layout, and orchestration in the page file. Dialogs, cards, table rows, controllers, and helper types should live in a sibling feature folder such as `bot-backend/`, `bot-shepherd/`, or `alert-settings/`.

When optimizing a page, first read the page file and the sibling folder README, then inspect only the component or hook file that owns the behavior being changed.
