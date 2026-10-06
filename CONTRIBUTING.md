# Contributing

This repository releases independently of `dskt-backend` and the setup workspace.

- Use conventional commits.
- Call the API through the generated client in `src/api`. Do not hand-copy domain types from the backend.
- Update the pinned OpenAPI file when the backend contract changes, then regenerate `src/api/schema.ts`.
- Do not commit `.env` files.
- Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run openapi:check`, and `npm run build` before opening a pull request.

The production container runs as the unprivileged nginx user.
