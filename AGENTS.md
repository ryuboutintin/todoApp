# AGENTS.md

## Overview
- This directory contains a standalone Todo web app built with plain `HTML`, `CSS`, and `JavaScript`.
- The app supports adding todos, completion toggles, deletion, priority assignment, drag-and-drop reordering, and `localStorage` persistence.

## Files
- `index.html`: App shell, form controls, and the board container for priority columns.
- `style.css`: Material-inspired responsive UI, priority column layout, and drag-and-drop visual states.
- `script.js`: Todo state management, rendering, persistence, priority updates, and drag-and-drop behavior.

## Data Model
- Todos are stored in `localStorage` under the `todos` key.
- Each todo item uses this shape: `{ id, text, completed, priority, order }`.
- Allowed priority values are `high`, `medium`, and `low`.

## Working Rules
- Keep the implementation dependency-free. Do not add frameworks or build tooling.
- Preserve separated files for structure (`index.html`), styling (`style.css`), and behavior (`script.js`).
- If drag-and-drop behavior changes, update both ordering logic and the related visual drop indicators.
- Maintain mobile responsiveness when changing layout or controls.
