# AGENTS.md

## Overview
- This directory contains a standalone Todo web app built with plain `HTML`, `CSS`, and `JavaScript`.
- The app now uses Supabase for authentication and Todo persistence.
- Users must log in before using the Todo board.
- Supported auth flows are email/password, Google OAuth, and GitHub OAuth.
- The UI supports adding todos, completion toggles, deletion, priority changes, drag-and-drop reordering, and sync/auth status messaging.

## Files
- `index.html`: App shell, login form, social login buttons, session bar, todo form, and the priority board container.
- `style.css`: Material-inspired responsive UI for auth screens, session state, todo columns, and drag-and-drop indicators.
- `script.js`: Supabase client setup, auth flow, per-user Todo CRUD, drag-and-drop ordering, render logic, and session handling.
- `DEPLOY.md`: Static hosting and Supabase deployment checklist.
- `SUPABASE.md`: Current Supabase data model and auth/storage integration notes.

## Runtime Dependencies
- The app stays dependency-free in the source tree.
- Supabase client code is loaded from the CDN script in `index.html`.
- The app should be served over `http://` or `https://`; `file://` is only warned about and is not a supported runtime mode.

## Data Model
- Remote persistence uses Supabase table `public.todos`.
- The database-facing shape is:
  - `{ id, user_id, text, completed, priority, sort_order, created_at, updated_at }`
- The client normalizes fetched rows into the in-memory shape:
  - `{ id, text, completed, priority, order }`
- Allowed priority values are `high`, `medium`, and `low`.
- Ordering is normalized per priority column on the client, then written back through `sort_order`.

## Storage Behavior
- Todo data is no longer read from `localStorage`.
- On app initialization, the old `localStorage["todos"]` entry is removed to avoid stale client-only data.
- `sessionStorage["pending-oauth-provider"]` is used temporarily to track an in-flight Google or GitHub login redirect.

## Auth and Session Flow
- The app hides the Todo UI until a Supabase session exists.
- Email sign-up sends a confirmation email and then signs out any temporary session created during sign-up.
- Email login requires a confirmed account.
- OAuth login returns to the current `origin + pathname` via `redirectTo`.
- `supabase.auth.onAuthStateChange()` is the source of truth for applying session changes to the UI.

## Working Rules
- Keep the implementation in plain `HTML`, `CSS`, and `JavaScript`; do not add frameworks or build tooling.
- Preserve separated files for structure (`index.html`), styling (`style.css`), and behavior (`script.js`).
- Keep Supabase auth and Todo sync behavior aligned with the UI text shown in the auth and sync status areas.
- If drag-and-drop behavior changes, update all three together:
  - client-side ordering logic
  - Supabase `sort_order` persistence
  - visual drop indicators in the CSS and DOM handlers
- Maintain mobile responsiveness when changing auth controls, session bar, or board layout.
