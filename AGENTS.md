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
- `src/promos.js` — pure send rules (Meta's 24 h window, per-contact send plan,
  error translation). Kept out of `lib.js` on purpose so `npm test` can import
  it without booting the Supabase client; `lib.js` re-exports it.
- `public/nini_master_prompt.md` — prompt template loaded by the app.
- `api/` — serverless API endpoints that require Supabase service-role or auth access.
- `EMPEZAR-AQUI.md` and `README.md` — onboarding and setup documentation.

## Build and run commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

- `npm test` — runner nativo de Node (`node --test`), sin dependencias extra.

Test coverage is partial: today the Meta Conversions API integration
(`tests/meta-capi.test.js`), the mass-send rules (`tests/promos.test.js`) and
the landing's lead qualification plus AI-provider selection
(`tests/calificacion.test.js`) are covered. There is no linter and no
type-checker configured in this repository.

## Environment and runtime conventions
- AI calls go through `api/_ia.js` (`intentosIA()`), which picks the provider:
  Groq by default, OpenAI first when `OPENAI_API_KEY` is set, always with Groq
  behind it as a fallback. Today only the landing's two call sites
  (`api/_web/chat.js`, `api/_web/calificar.js`) use it; the CRM's own AI
  functions still build their Groq request inline. Read the note at the top of
  `api/_ia.js` before pointing a paid key at a public endpoint.
- Frontend public envs must use `VITE_` prefix and are read from `import.meta.env`.
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_N8N_SEND_WEBHOOK`
  - `VITE_MESSENGER_SEND_ENDPOINT`
  - `VITE_ELEVENLABS_API_KEY`
  - `VITE_ELEVENLABS_VOICE_ID`
- Serverless API endpoints use standard Node env vars such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Do not move `SUPABASE_SERVICE_ROLE_KEY` to the client-side code.
- `.env.example` lists every variable with fictitious values. Meta Conversions API vars (`META_*`) are documented in `META-CAPI.md`.
- Vercel Hobby caps the project at **12 serverless functions** and `api/` is exactly at 12. Files and folders starting with `_` inside `api/` do not count: that is the mechanism for shared code (`_meta/`, `_push/`, `_reporte/`, `_fin/`, `_cotizacion/`, `_web/`). New endpoints hang off an existing dispatcher plus a rewrite in `vercel.json` — `api/push.js` already dispatches four actions this way (`subscribe`, `send`, `meta`, `lead`).

## Key conventions and patterns
- The app uses ES modules (`type: module` in `package.json`).
- Styling is largely inline and component-local, not via a separate CSS framework.
- `src/lib.js` is the single source of truth for Supabase client configuration and shared constants.
- `api/*.js` endpoints are intended for server-side operations such as creating vendors, handling Messenger webhooks, push notifications, uploads, etc.
- Most data access is performed through Supabase queries in the frontend and serverless endpoints.
- The CRM uses Supabase Realtime channels and auth session persistence.
- **All outbound messages go through `enviarPorCanal()` in `src/lib.js`** — chat
  and mass promotions alike. Do not re-implement channel routing in a component.
- Outbound WhatsApp goes through Meta's official Cloud API, so the **24 h
  customer-service window applies**: free-form text only reaches contacts who
  wrote within the last 24 h; anyone older needs an approved template. See
  `PROMOCIONES.md` before touching anything that sends messages.
- **Public pages live in `public/`, outside the SPA.** `public/cotizacion/` (the
  signable Purchase Agreement) and `public/business/` (the business-packages
  landing) are plain HTML/CSS/JS served straight from disk, excluded from the
  SPA catch-all in `vercel.json` and from the service-worker precache in
  `vite.config.js`. They are customer-facing marketing/legal documents, not CRM
  screens: no React, no build step, portable to WordPress. See
  `LANDING-BUSINESS.md`.
- Anything shown to a customer — landing, quote, or a message the AI writes —
  must comply with `api/_ntg.js`, the authoritative commercial fact sheet
  (prices, what may never be claimed). A price change touches `api/_ntg.js`,
  `public/nini_master_prompt.md` **and** `public/business/index.html`.

## What the AI agent should do
- Prefer small, targeted changes over large rewrites.
- Preserve existing Supabase auth and RLS behavior.
- Keep public prompt content in `public/nini_master_prompt.md` intact unless prompt updates are explicitly requested.
- Link to documentation rather than duplicating it: `README.md` and `EMPEZAR-AQUI.md` contain setup steps and env guidance.

## Notes for Claude-style agents
- The repository is primarily a frontend app with a small set of serverless functions. Focus on the flow between `src/`, `src/lib.js`, and `api/`.
- If an issue involves environment configuration or deployment, consult `README.md` and `EMPEZAR-AQUI.md` for the intended setup.
- There are no tests in this repo, so code changes should be made conservatively and with attention to existing runtime assumptions.
