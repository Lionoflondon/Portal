# Portal Architecture

## Product Model

Portal starts with two primitives:

- Report: evidence about something happening in the world.
- Conversation: casual discussion, replies, and reactions.

Reports attach to Events. Events connect into Constellations through parent, child, and related-event relationships.

## Frontend

The application is a Vite React SPA. It uses hash routing for the initial foundation because the approved prototype already uses hash navigation and this keeps Firebase Hosting rewrites simple while preserving reload-safe routes.

Key areas:

- `src/ui/App.jsx`: app shell, routes, pages, reusable UI sections.
- `src/styles.css`: Portal design tokens and responsive styling from the approved prototype.
- `src/domain/portal.js`: current static domain fixtures and product vocabulary.
- `src/services/firebase.js`: Portal-only Firebase service boundaries.

## Backend Boundary

The app has service interfaces for:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage

No Cloud Functions are created yet. The approved prototype does not require server-side execution for the first canonical foundation.

## Data Services

Current data is static fixture data. Firestore collections should be introduced only when product workflows are implemented:

- `events`
- `reports`
- `conversations`
- `sources`
- `constellations`
- `contributors`
