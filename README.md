# dskt-frontend

Independent DSKT web application. React and Vite render the interface. API calls go through a client generated from a pinned backend OpenAPI file.

This slice shows process liveness and database readiness. It does not implement product screens.

## Commands

```bash
npm ci
npm run dev
npm test
npm run lint
npm run format
npm run typecheck
npm run build
npm run openapi:generate
npm run openapi:check
```

Copy `.env.example` to `.env` before `npm run dev`. `VITE_API_BASE_URL` must be reachable from the browser. The example value is a local origin, not a credential.

From the setup workspace, `docker compose up --build` serves the built app at <http://localhost:8080>. The image is based on `nginxinc/nginx-unprivileged` and listens on port 8080.

## Contract

`openapi/dskt-backend.openapi.json` is a pinned copy of the backend contract. After the backend publishes a new `contract/openapi.json`, copy it here and run `npm run openapi:generate`. Commit both the pin and `src/api/schema.ts`.
