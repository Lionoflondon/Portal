# Deployment Notes

## Firebase Project

Target project:

```text
portal-prod-f2308
```

Deployment is gated until this project is confirmed to be dedicated to Portal.

## Hosting

Expected static output:

```text
dist/
```

Because Portal currently uses hash routing, SPA rewrites are not required for route correctness. If path-based routing replaces hash routing later, configure:

```json
{
  "source": "**",
  "destination": "/index.html"
}
```

## Required Validation

Run only Portal-local checks:

```bash
npm run lint
npm test
npm run build
```

Deploy only after:

- GitHub repository exists.
- Production build passes.
- Tests pass.
- Firebase project is confirmed Portal-only.
- Hosting site/target is confirmed Portal-only.
- No unrelated repositories changed.
