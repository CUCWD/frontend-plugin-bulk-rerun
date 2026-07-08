# frontend-plugin-bulk-rerun

[![License](https://img.shields.io/github/license/CUCWD/frontend-plugin-bulk-rerun.svg)](https://github.com/CUCWD/frontend-plugin-bulk-rerun/blob/main/LICENSE)
[![Status](https://img.shields.io/badge/Status-Maintained-brightgreen)]()

A React frontend plugin for **OpenEdX Studio** that lets administrators create dozens of course reruns in a single batch operation — instead of duplicating courses one at a time through the Studio UI.

---

## Table of Contents

- [What It Does](#what-it-does)
- [How It Works](#how-it-works)
  - [Step 1 — Select](#step-1--select)
  - [Step 2 — Configure](#step-2--configure)
  - [Step 3 — Review and Submit](#step-3--review-and-submit)
  - [Tracking Progress](#tracking-progress)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [State Management](#state-management)
  - [API Integrations](#api-integrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Plugging Into frontend-app-authoring](#plugging-into-frontend-app-authoring)
  - [Environment Variables](#environment-variables)
- [Development](#development)
  - [Available Scripts](#available-scripts)
- [License](#license)
- [Contributing](#contributing)

---

## What It Does

In OpenEdX, every course is identified by a key in the format `org/number/run` — for example, `MITx/6.001/2025_Fall`. A **rerun** creates a new course from an existing source course, preserving the content but giving it a new organization, run ID, and schedule. Creating reruns one at a time through Studio is slow and error-prone when you need to provision 20, 30, or 50 courses at once.

`frontend-plugin-bulk-rerun` solves this with a **guided 3-step wizard** that lets staff:

1. Select multiple DEMO template courses and destination organizations
2. Configure shared settings (scheduling, certificates, team access, gating) across all courses at once
3. Review the full plan, then submit a single batch job to the backend

The plugin is delivered as an [OpenEdX frontend plugin](https://github.com/openedx/frontend-plugin-framework) that slots directly into Studio Home **without modifying `frontend-app-authoring` source code**. It talks to the [openedx-bulk-rerun-ext](https://github.com/CUCWD/openedx-bulk-rerun-ext) Django backend for all server-side operations.

---

## How It Works

The plugin renders two top-level views, accessible via a sub-navigation bar:

| View | Purpose |
|---|---|
| **Bulk Run Wizard** | Set up and submit a new batch rerun |
| **Tracking Progress** | Monitor running and completed batch jobs |

### Step 1 — Select

**File:** [`src/steps/StepSelect/index.jsx`](src/steps/StepSelect/index.jsx)

The user picks what to copy and where to copy it.

- A table lists all **DEMO source courses** — courses whose run ID contains "DEMO" — fetched from Studio's `GET /api/contentstore/v1/home/courses` endpoint. These act as templates.
- Filters are available by source organization and by program (when Course Discovery is enabled).
- After selecting courses, the user picks **destination organizations** from the LMS `GET /api/organizations/v0/organizations/` endpoint. Source orgs are excluded from the destination list to prevent accidental self-collisions.
- The plugin displays a running count: `N courses × M orgs = N×M runs to be created`.

On clicking **Configure**, the plugin builds a flat list of rows — one per course-and-org pair — and carries them into Step 2.

### Step 2 — Configure

**File:** [`src/steps/StepConfigure/index.jsx`](src/steps/StepConfigure/index.jsx)

The user sets all the details for the batch. Shared settings apply to every course run in the batch:

| Tab | Settings |
|---|---|
| **Scheduling** | Course start/end, enrollment open/close, pacing (instructor vs. self-paced) |
| **Certificates** | Certificate mode, display timing, student-generated cert options |
| **Gating** | Prerequisite gating (disabled, copy from source, or custom min-score / min-completion rules) |

Below the shared settings, courses are grouped by **destination org** inside an expandable accordion. Each org section has two sub-tabs:

- **Courses** — shows the table of course runs for that org. The "Target Run" ID is editable per-row. As you type, the plugin debounces a `POST /api/bulk-rerun/validate/` call to check whether the generated course key already exists on the platform. Conflicts are flagged in real time with color-coded indicators.
- **Team & Access** — assign Studio and Discussion roles (e.g., staff, instructor, discussion admin) to team members per org. Email addresses are validated live against the LMS `POST /api/user/v1/accounts/search_emails` endpoint; unrecognized accounts are flagged before submission.

The **Review** button is only enabled when all of the following are true:
- All course keys have been validated with no conflicts
- All schedule dates are filled in and logically ordered
- All team member email addresses resolve to real platform accounts

### Step 3 — Review and Submit

**File:** [`src/steps/StepReview/index.jsx`](src/steps/StepReview/index.jsx)

A read-only pre-flight summary of the entire batch:

- A **settings summary grid** showing the schedule, certificate config, gating rules, team assignments, and org list
- An **accordion** listing every planned course run grouped by org, with any remaining conflict warnings highlighted

Two execution modes are available (the dry-run mode requires `ENABLE_BULK_RERUN_DRY_RUN=true`):

| Mode | What Happens |
|---|---|
| **Execute reruns** | Creates real course runs, applies all settings, syncs Course Discovery, and links programs |
| **Preview plan (dry-run)** | Validates every step server-side without writing or modifying any data |

On submit, the plugin calls `POST /api/bulk-rerun/batches/` with a structured payload (built in [`src/utils/batchPayload.ts`](src/utils/batchPayload.ts)) and immediately navigates the user to the Tracking view while the backend processes the batch asynchronously.

### Tracking Progress

**Files:** [`src/steps/StepProgress/`](src/steps/StepProgress/), [`src/tracking/`](src/tracking/)

The Tracking view has two sub-tabs:

**Current** — lists all active and in-progress batch jobs. Each job card:
- Shows a live per-course progress breakdown (succeeded / failed / pending)
- Polls `GET /api/bulk-rerun/batches/:id/` every 2 seconds until the job reaches a terminal state
- Supports cancellation via `POST /api/bulk-rerun/batches/:id/cancel/`
- Can be dismissed once complete; the result is saved to History

On page load, the plugin fetches `GET /batches/?status=running,pending` to **recover any in-flight batches** that were running before a page refresh or from another device.

**History** — lists completed runs (succeeded / failed / partial) pulled from the server and from `localStorage`. Clicking any entry shows the full per-course job breakdown with log output.

---

## Architecture

### Project Structure

```
src/
├── BulkRerunsTab/          # Root component — renders wizard or tracking view
├── steps/
│   ├── StepSelect/         # Step 1: pick courses and destination orgs
│   ├── StepConfigure/      # Step 2: shared settings + per-org course/team tabs
│   ├── StepReview/         # Step 3: read-only summary + submit
│   └── StepProgress/       # Tracking → Current tab: live job cards with polling
├── tracking/               # Tracking → History tab and job detail views
├── utils/
│   ├── batchPayload.ts     # Converts wizard config into the POST /batches/ request body
│   ├── courseKeys.ts       # Course key helpers: formatting, validation, conflict detection
│   ├── scheduling.ts       # Date formatting utilities
│   └── buildExport.ts      # CSV/export helpers
├── hooks.ts                # All API calls as TanStack Query hooks
├── state.ts                # Global Hookstate store
└── index.tsx               # Plugin entry point — exports BulkRerunsTab
```

### State Management

Global state is managed with a [Hookstate](https://hookstate.js.org/) singleton defined in [`src/state.ts`](src/state.ts). It covers:

| State slice | What it holds |
|---|---|
| Navigation | Which view is active (`wizard` or `tracking`), which wizard step (0–2), which tracking sub-tab |
| Wizard data | Selected course rows, source mode, program reference, configuration object |
| Active jobs | List of in-flight batch jobs with their IDs, configs, and dry-run flags |
| History | Completed run entries, persisted to `localStorage` (`bulk_rerun_history`, capped at 100 entries) |

Using a module-level singleton instead of component-scoped state prevents the `HOOKSTATE-102` error that occurs when a state owner unmounts during view transitions.

### API Integrations

All API calls are wrapped as [TanStack Query](https://tanstack.com/query) hooks in [`src/hooks.ts`](src/hooks.ts):

| Hook | Method | Endpoint | Purpose |
|---|---|---|---|
| `useValidateCourseKeys` | POST | `/api/bulk-rerun/validate/` | Check which target course keys already exist |
| `useCreateBatch` | POST | `/api/bulk-rerun/batches/` | Submit a new batch job |
| `useCancelBatch` | POST | `/api/bulk-rerun/batches/:id/cancel/` | Cancel a running or pending batch |
| `useBatch` | GET | `/api/bulk-rerun/batches/:id/` | Poll batch status (every 2s until terminal) |
| `useRunningBatches` | GET | `/api/bulk-rerun/batches/?status=...` | Recover in-flight jobs on page load |
| `useServerHistory` | GET | `/api/bulk-rerun/batches/?status=succeeded,failed,partial` | Fetch completed run history |
| `useOrgs` | GET | `/api/organizations/v0/organizations/` | List available destination orgs (LMS) |
| `usePrograms` | GET | `/api/v1/programs/?status=active` | List active programs (Course Discovery) |
| `useCourses` | GET | `/api/contentstore/v1/home/courses` | List DEMO source courses (Studio) |
| `useSearchEmails` | POST | `/api/user/v1/accounts/search_emails` | Validate team member email addresses (LMS) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) — use the version specified in `.nvmrc`
- [nvm](https://github.com/nvm-sh/nvm) (recommended for managing Node versions)
- A running OpenEdX instance with the [openedx-bulk-rerun-ext](https://github.com/CUCWD/openedx-bulk-rerun-ext) backend plugin installed
- A running instance of [frontend-app-authoring](https://github.com/openedx/frontend-app-authoring) for local development

[Tutor](https://github.com/overhangio/tutor) is the recommended development environment. See the [tutor-mfe documentation](https://github.com/overhangio/tutor-mfe#mfe-development) for setup details.

### Installation

```sh
git clone https://github.com/CUCWD/frontend-plugin-bulk-rerun.git
cd frontend-plugin-bulk-rerun

# Use the correct Node version
nvm use

# Install dependencies
npm install
```

### Plugging Into frontend-app-authoring

This plugin uses the [OpenEdX frontend plugin framework](https://github.com/openedx/frontend-plugin-framework) and does not require changes to `frontend-app-authoring` source code. To activate it, update the `env.config.jsx` file inside your `frontend-app-authoring` installation:

```jsx
import { DIRECT_PLUGIN, PLUGIN_OPERATIONS } from '@openedx/frontend-plugin-framework';
import { BulkRerunsTab } from '@cucwd/frontend-plugin-bulk-rerun';

const config = {
  ...process.env,
  pluginSlots: {
    'org.cucwd.frontend.authoring.studio_home_bulk_reruns.v1': {
      keepDefault: false,
      plugins: [
        {
          op: PLUGIN_OPERATIONS.Insert,
          widget: {
            id:           'bulk_reruns_tab',
            type:         DIRECT_PLUGIN,
            priority:     50,
            RenderWidget: BulkRerunsTab,
          },
        },
      ],
    },
  },
};

export default config;
```

### Environment Variables

Copy `.env` to `.env.local` and fill in the values for your environment:

| Variable | Description |
|---|---|
| `LMS_BASE_URL` | Base URL of the OpenEdX LMS (e.g. `http://local.openedx.io:8000`) |
| `STUDIO_BASE_URL` | Base URL of OpenEdX Studio / CMS |
| `DISCOVERY_API_BASE_URL` | Base URL of the Course Discovery service (optional; required for program filtering) |
| `ENABLE_BULK_RERUN_DRY_RUN` | Set to `true` to enable the "Preview plan (dry-run)" option on the Review step. Default: `false` |
| `PORT` | Local dev server port. Default: `8080` |

---

## Development

### Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the local dev server at `http://localhost:8080` |
| `npm run build` | Build the production bundle |
| `npm test` | Run the test suite with coverage |
| `npm run lint` | Run ESLint and Stylelint |
| `npm run lint:fix` | Run linters and auto-fix fixable issues |
| `npm run types` | Type-check TypeScript files without emitting output |
| `npm run snapshot` | Update Jest snapshots |

A pre-commit hook (via Husky) runs the full lint check before every commit.

---

## License

The code in this repository is licensed under the **AGPLv3** unless otherwise noted. See [LICENSE](LICENSE) for details.

---

## Contributing

Contributions are welcome. Please read the [OpenEdX contribution guide](https://openedx.org/r/how-to-contribute) before opening a pull request.

For bugs and feature requests, open an issue at:
https://github.com/CUCWD/frontend-plugin-bulk-rerun/issues

For questions, join the OpenEdX community on [Slack](https://openedx.org/slack) or the [discussion forums](https://discuss.openedx.org).

All community members are expected to follow the [OpenEdX Code of Conduct](https://openedx.org/code-of-conduct/).
