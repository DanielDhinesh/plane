<p align="center">
  <img src="apps/web/public/icons/icon-192x192.png" width="96" alt="Stratify logo" />
</p>

<h1 align="center">Stratify</h1>
<p align="center"><b>Strategy to execution.</b><br/>The open-source business and project management platform — every feature free, no user limits, self-hosted with one Docker Compose file.</p>

---

Stratify is a fork of the [Plane](https://github.com/makeplane/plane) Community Edition (AGPL-3.0) that removes every paywall and adds the
features teams usually buy Jira, Confluence and monday.com for.

## What's included

| Area                                  | What you get                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Work management**                   | Work items, sub-items, relations, cycles (sprints), modules, views, intake, estimates (points, categories **and time**), timeline, analytics, archives                                                                                                                                                                                                                                  |
| **Teams**                             | Group people and projects into teams with leads; team dashboards (open / overdue / completed work); filter any sheet by team; team membership emails                                                                                                                                                                                                                                    |
| **Jira-style workflows**              | Per-project transition matrix (from → to), role-restricted transitions (admin / member / guest), admin bypass, one-click presets; enforced on boards, lists, bulk edits and the public API                                                                                                                                                                                              |
| **Knowledge base (Confluence-style)** | Spaces (workspace-wide or private), unlimited nested pages, rich-text editor with autosave, page locking, move pages, full version history with restore, full-text search                                                                                                                                                                                                               |
| **Sheets**                            | A workspace-wide spreadsheet of every work item you can access, filterable by project, team, status, state, priority, labels, assignee, start/due/created/updated dates, overdue, free-text / ID search; grouping, sorting, column picker, saved filter presets, CSV export and bulk edit                                                                                               |
| **Bulk operations**                   | Select many work items in lists/spreadsheets and set state, priority, dates, labels or assignees at once                                                                                                                                                                                                                                                                                |
| **Industry templates**                | 14 ready-made project templates — Agile Scrum, Kanban, Bug Tracking, IT Service Desk, Marketing Campaign, Product Launch, Sales Pipeline (CRM), Recruiting, Employee Onboarding, Construction, Event Planning, Editorial Calendar, OKRs & Strategy, Month-end Close — each with states, labels, modules, workflow transitions and example items. Save any project as your own template. |
| **Your own mail server**              | Per-workspace SMTP (host, port, STARTTLS/SSL, credentials stored encrypted, from / reply-to), provider presets, test email, and switches for work-item updates, invitations, team notices and a **daily digest** (overdue, due-soon and in-progress items for each member)                                                                                                              |
| **Active cycles**                     | Every running cycle across projects with live progress                                                                                                                                                                                                                                                                                                                                  |
| **No limits**                         | No plans, seats, upgrade prompts or feature gates. Telemetry is off by default in the self-host stack.                                                                                                                                                                                                                                                                                  |

All new screens are responsive (phone → desktop) and follow the light/dark theme.

## Self-host in one command

Requirements: Docker 24+ with the Compose plugin, 4 GB RAM (8 GB recommended for the first build).

```bash
git clone https://github.com/DanielDhinesh/plane.git stratify && cd stratify
git checkout feat/stratify-open-platform
./stratify.sh up          # creates .env.selfhost with random secrets on first run, builds and starts everything
```

Open `http://localhost` (or your domain). Create the instance admin at `/god-mode`, then your first workspace.

Prefer plain Docker Compose?

```bash
cp .env.selfhost.example .env.selfhost   # edit secrets, domain and SMTP
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build
```

`docker-compose.selfhost.yml` builds every service from this repository — web, admin, space, live, API, workers, scheduler, Caddy proxy (automatic HTTPS), PostgreSQL, Valkey, RabbitMQ and S3-compatible storage. Migrations run automatically before the API starts.

| Helper                                             | Does                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `./stratify.sh setup`                              | Create `.env.selfhost` with random secrets (asks for your URL) |
| `./stratify.sh up` / `down` / `restart` / `status` | Lifecycle                                                      |
| `./stratify.sh logs api`                           | Follow logs                                                    |
| `./stratify.sh update`                             | `git pull` + rebuild + restart                                 |
| `./stratify.sh backup`                             | Dump the database to `./backups/`                              |

**HTTPS:** set `SITE_ADDRESS=pm.example.com`, `WEB_URL=https://pm.example.com` and `CERT_EMAIL=email you@example.com` in `.env.selfhost`; Caddy obtains certificates automatically.

**External S3:** set `USE_MINIO=0`, `AWS_S3_ENDPOINT_URL`, `AWS_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` and `AWS_S3_BUCKET_NAME`.

## Email

There are two layers:

1. **Instance default** — `EMAIL_*` variables in `.env.selfhost`, or _God mode → Email_ at runtime. Used for sign-in codes, password resets and any workspace without its own server.
2. **Per workspace** — _Workspace settings → Mail server_. Admins enter their SMTP server (presets for Google Workspace, Microsoft 365, Amazon SES, SendGrid, Mailgun, Zoho), send a test message and choose which emails go out: work-item updates, invitations, team changes and the daily digest (hour configurable, UTC).

## Using the new features

- **Teams** — sidebar → _Teams_ → _New team_. Pick a lead, members and projects. Open _Sheets_ from a team to see all of its work.
- **Workflow** — _Project settings → Workflow_. Click cells in the matrix to allow moves, restrict roles per transition, then _Enforce workflow_.
- **Knowledge base** — sidebar → _Knowledge base_ → _New space_. Use `+` in the page tree for sub-pages, _History_ to compare/restore versions, _Lock_ to freeze a page.
- **Sheets** — sidebar → _Sheets_. Combine filters, group, choose columns, save presets, export CSV, select rows to bulk edit.
- **Templates** — sidebar → _Templates_ → _Use template_. Or _Save a project as template_ to reuse your own setup.

## Architecture

| Path                                    | What                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web`                              | Main app (React Router v7 + MobX). New UI lives in `components/suite/*`, routes in `app/routes/extended.ts`        |
| `apps/api`                              | Django REST API + Celery. New features are the `plane.suite` app (`apps/api/plane/suite`) mounted at `/api/suite/` |
| `apps/admin`, `apps/space`, `apps/live` | Instance admin, public boards, realtime collaboration                                                              |
| `packages/*`                            | Shared constants (branding in `packages/constants/src/brand.ts`), types, editor, i18n, UI blocks                   |

### `plane.suite` API (all under `/api/suite/workspaces/<slug>/`)

`teams/`, `teams/<id>/`, `teams/<id>/membership/` · `projects/<id>/workflow/`, `projects/<id>/workflow/allowed/` · `wiki/spaces/…`, `wiki/spaces/<id>/pages/…`, `…/versions/`, `wiki/search/` · `templates/`, `templates/create-project/`, `templates/custom/`, `projects/<id>/apply-template/` · `mail-settings/`, `mail-settings/test/` · `sheets/`, `sheets/meta/`, `work-items/bulk-update/` · `active-cycles/`

## Development

See [AGENTS.md](AGENTS.md) for the full command reference.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # or ./setup.sh
docker compose -f docker-compose-local.yml up -d   # API, worker, Postgres, Redis, RabbitMQ, storage
pnpm dev                                           # web :3000, admin :3001, space :3002
```

Checks: `pnpm check` (format, lint, types). Backend tests: `docker compose -f docker-compose-test.yml run --rm --build api-tests pytest plane/tests/contract/app/test_suite_app.py plane/tests/unit/suite`.

## License and attribution

Stratify is licensed under the **GNU Affero General Public License v3.0** (see [LICENSE.txt](LICENSE.txt)). It is based on the Plane
Community Edition, © Plane Software, Inc. and contributors. If you run a modified version for users over a network, the AGPL
requires you to offer them the corresponding source code.

“Stratify” is used here as a working product name; check trademark availability in your markets before launching publicly.
