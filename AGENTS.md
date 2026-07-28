# AI Agent Instructions for ninit-crm

## Purpose
This repository is a React + Vite CRM frontend backed by Supabase and Vercel serverless functions. AI coding agents should use this file to understand repository structure, core conventions, and the safest way to make changes.

## Project overview
- Frontend: React + Vite, single-page app in `src/`, entry point is `src/main.jsx` and main layout is in `src/App.jsx`.
- Backend: Vercel serverless endpoints in `api/*.js`.
- Database: Supabase Postgres with RLS enabled.
- Integrations: n8n webhook for WhatsApp, Supabase storage and push notifications, optional Messenger endpoint.
- Deployment: Vercel, with environment variables configured in `.env` for local development and in Vercel for production.

## Important files
- `package.json` — project scripts and dependency list.
- `src/lib.js` — central Supabase client, env constants, shared helpers, and app-wide configuration.
- `src/App.jsx` — core UI, routing, Supabase auth, and main CRM page logic.
- `src/assistant.js` — prompt loading and assistant utilities.
- `public/nini_master_prompt.md` — prompt template loaded by the app.
- `api/` — serverless API endpoints that require Supabase service-role or auth access.
- `EMPEZAR-AQUI.md` and `README.md` — onboarding and setup documentation.

## Build and run commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

There are no dedicated test scripts in this repository.

## Environment and runtime conventions
- Frontend public envs must use `VITE_` prefix and are read from `import.meta.env`.
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_N8N_SEND_WEBHOOK`
  - `VITE_MESSENGER_SEND_ENDPOINT`
  - `VITE_ELEVENLABS_API_KEY`
  - `VITE_ELEVENLABS_VOICE_ID`
- Serverless API endpoints use standard Node env vars such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Do not move `SUPABASE_SERVICE_ROLE_KEY` to the client-side code.

## Key conventions and patterns
- The app uses ES modules (`type: module` in `package.json`).
- Styling is largely inline and component-local, not via a separate CSS framework.
- `src/lib.js` is the single source of truth for Supabase client configuration and shared constants.
- `api/*.js` endpoints are intended for server-side operations such as creating vendors, handling Messenger webhooks, push notifications, uploads, etc.
- Most data access is performed through Supabase queries in the frontend and serverless endpoints.
- The CRM uses Supabase Realtime channels and auth session persistence.

## What the AI agent should do
- Prefer small, targeted changes over large rewrites.
- Preserve existing Supabase auth and RLS behavior.
- Keep public prompt content in `public/nini_master_prompt.md` intact unless prompt updates are explicitly requested.
- Link to documentation rather than duplicating it: `README.md` and `EMPEZAR-AQUI.md` contain setup steps and env guidance.

## Notes for Claude-style agents
- The repository is primarily a frontend app with a small set of serverless functions. Focus on the flow between `src/`, `src/lib.js`, and `api/`.
- If an issue involves environment configuration or deployment, consult `README.md` and `EMPEZAR-AQUI.md` for the intended setup.
- There are no tests in this repo, so code changes should be made conservatively and with attention to existing runtime assumptions.
