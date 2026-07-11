# Portal

Portal is an independent product for organising real-world happenings into events, reports, conversations, sources, and constellations.

This repository is the canonical Portal web application. It has no dependency on Circum, Circum Rider, ParkPal, IRIS, Roth, Vanguard, Health+, Gifts, or their Firebase/backend infrastructure.

## Framework

- React 18
- Vite
- Firebase client SDK
- Vitest
- ESLint

React with Vite is used because the approved Portal prototype is a client-side application shell with SPA routing, reusable interaction patterns, and no server-rendering requirement.

## Commands

```bash
npm install
npm run lint
npm test
npm run test:rules
npm run build
```

## Entry Point

- HTML entry: `index.html`
- Application entry: `src/main.jsx`
- Root component: `src/ui/App.jsx`

## Build Output

Production build output is generated in:

```text
dist/
```

## Firebase

Portal uses only a dedicated Portal Firebase project. Runtime Firebase configuration is supplied through `VITE_FIREBASE_*` environment variables. See `.env.example`.

Phase 2 connects Firebase Authentication, Cloud Firestore, and Cloud Storage. Firestore and Storage rules live in `firestore.rules` and `storage.rules`; use Java 21+ when running the Firebase emulators for `npm run test:rules`.

No Firebase deployment should happen unless the project, hosting site, and hosting target are confirmed as Portal-only.
