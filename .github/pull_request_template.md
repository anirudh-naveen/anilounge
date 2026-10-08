## What

<!-- What does this change and why? Link the issue if there is one. -->

## How to test

<!-- Steps a reviewer can follow, or the tests that cover it. -->

## Checklist

- [ ] `npm run format:check`, `npm run lint:check`, `npm run type-check` and `npm run test:unit:ci` pass
- [ ] `npm test` passes in `backend/` (if backend changed)
- [ ] Added/updated tests for new behaviour
- [ ] Schema changes are in `backend/db/schema.sql` and safe to apply to the live DB
- [ ] New env vars are documented in `backend/.env.example`
- [ ] Screenshots attached for UI changes
