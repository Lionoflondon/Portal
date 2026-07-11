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
- `src/domain/portal.js`: shared product vocabulary and route definitions.
- `src/services/firebase.js`: Portal-only Firebase service boundaries.

## Backend Boundary

The app uses only Portal Firebase services:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage

No Cloud Functions are created. Authentication, ownership enforcement, and server timestamps are handled by Firebase Authentication, Firestore rules, and Firestore itself; there is no server-side workflow that needs a separate function yet.

## Data Services

Firestore collections:

- `users/{uid}`: private Portal profile and preferences.
- `users/{uid}/vortex/{eventId}`: private followed-event map used by Vortex.
- `events/{eventId}`: shared real-world event, its status, summary, relationship parent, ownership, and timestamps.
- `events/{eventId}/reports/{reportId}`: shared evidence attached to an event, owned by its submitter.

Storage is reserved for approved UI upload flows:

- `users/{uid}/private/...`: owner-only private files.
- `event-media/{eventId}/{uid}/{fileName}`: authenticated owned image/video evidence, max 10 MiB.

No sample content is used by the live routes. Events and Vortex populate from Firestore after authentication.
