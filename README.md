# vikunja-mcp

A remote MCP (Model Context Protocol) server that connects Claude to your
self-hosted [Vikunja](https://vikunja.io) instance. Add it as a custom
connector in Claude.ai and manage your tasks conversationally.

## Available tools

| Tool | Description |
|---|---|
| `list_projects` | List all projects |
| `get_project` | Get project details |
| `create_project` | Create a new project |
| `update_project` | Update a project |
| `delete_project` | Delete a project |
| `list_tasks` | List/filter/search tasks across all projects |
| `get_task` | Get task details including comments |
| `create_task` | Create a task in a project |
| `update_task` | Update task properties |
| `delete_task` | Delete a task |
| `complete_task` | Mark a task as done |
| `reopen_task` | Mark a task as not done |
| `add_comment` | Add a comment to a task |
| `list_labels` | List all labels |
| `create_label` | Create a new label |
| `add_label_to_task` | Attach a label to a task |
| `remove_label_from_task` | Remove a label from a task |
| `weekly_review` | Generate a weekly review summary |
| `get_calendar` | Agenda view of tasks with due dates (overdue + upcoming) |
| `create_relation` | Link two tasks (subtask, blocking, precedes, related, …) |
| `remove_relation` | Remove a relation between two tasks |
| `bulk_update_tasks` | Update multiple tasks at once (priority, status, dates, …) |
| `get_notifications` | Get all notifications with unread count |
| `create_filter` | Save a named filter for reuse |
| `get_filter` | Get a saved filter by ID |
| `update_filter` | Update a saved filter |
| `delete_filter` | Delete a saved filter |
| `get_calendar_events` | Events from configured .ics files and webcal feeds, grouped by day |

## Quick start

```bash
npm install
npm run build

export VIKUNJA_URL=https://your-vikunja-instance.example.com
export VIKUNJA_TOKEN=your-api-token
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
export PORT=9090

node build/index.js
```

Then add your server as a custom connector in Claude.ai under
Settings > Connectors:

```
https://your-server.example.com/mcp?token=<MCP_AUTH_TOKEN>
```

See [DEPLOY-UBERSPACE.md](./DEPLOY-UBERSPACE.md) for a full deployment
walkthrough on Uberspace.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `VIKUNJA_URL` | Yes | Base URL of your Vikunja instance (no trailing slash) |
| `VIKUNJA_TOKEN` | Yes | API token from Vikunja Settings > API Tokens |
| `MCP_AUTH_TOKEN` | Recommended | Shared secret for the `/mcp` endpoint — see [Auth](#auth) |
| `PORT` | No | Port to listen on (default: `3000`) |
| `CALENDAR_ICS_FILES` | No | Comma-separated paths to local `.ics` files |
| `CALENDAR_ICS_URLS` | No | Comma-separated webcal/https iCal subscription URLs |

## Auth

When `MCP_AUTH_TOKEN` is set, the server rejects any request to `/mcp` that
does not include a matching `?token=…` query parameter with a `401 Unauthorized`
response.

Generate a strong token:

```bash
openssl rand -hex 32
```

Add it to the connector URL in Claude.ai:

```
https://your-server.example.com/mcp?token=<your-token>
```

If `MCP_AUTH_TOKEN` is left unset the endpoint is open to anyone who can reach
it — only do this on a private, firewalled network.

## Calendar integration

The `get_calendar_events` tool reads events from any number of `.ics` sources
and returns them grouped by day. When configured, `weekly_review` also shows a
`THIS WEEK'S CALENDAR` section so your schedule and task backlog are reviewed
together.

**Posteo users:** your webcal subscription URL is under Calendar Settings →
iCal subscription. Add it to `CALENDAR_ICS_URLS` — no sync daemon needed.

```bash
export CALENDAR_ICS_URLS=webcal://posteo.de/calendars/you/personal
```

For multiple calendars, separate with commas:

```bash
export CALENDAR_ICS_URLS=webcal://posteo.de/calendars/you/personal,webcal://posteo.de/calendars/you/work
```

For local `.ics` files (e.g. synced from CalDAV via vdirsyncer):

```bash
export CALENDAR_ICS_FILES=/home/user/calendars/shifts.ics,/home/user/calendars/personal.ics
```

Both vars are optional. Calendar features are silently disabled when neither is set.

## Vikunja task calendar feed

The server exposes a machine-readable iCal feed you can subscribe to in any
calendar app:

```
webcal://your-server.example.com/calendar.ics
```

It includes all open tasks and tasks completed in the last 30 days that have a
start date, due date, or end date. Subscribe once and your calendar app will
poll it automatically.

## Architecture

- **Transport:** Streamable HTTP (stateless) — the current MCP standard
  for remote servers
- **Auth:** Query-parameter token (`MCP_AUTH_TOKEN`) for the MCP endpoint;
  Vikunja API token for upstream API calls
- **Runtime:** Node.js + Express
- **SDK:** `@modelcontextprotocol/sdk` v1.x

## Requirements

- Node.js ≥ 18
- A self-hosted Vikunja instance with an API token
- A publicly-accessible URL for Claude.ai to reach the server
