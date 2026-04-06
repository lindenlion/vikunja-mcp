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

## Quick start

```bash
npm install
npm run build

export VIKUNJA_URL=https://vikunja.lindenlion.net
export VIKUNJA_TOKEN=your-api-token
export PORT=9090

node build/index.js
```

Then add `https://mcp.vikunja.lindenlion.net/mcp` as a custom connector
in Claude.ai under Settings > Connectors.

See [DEPLOY-UBERSPACE.md](./DEPLOY-UBERSPACE.md) for full deployment
instructions on Uberspace.

## Architecture

- **Transport:** Streamable HTTP (stateless) — the current MCP standard
  for remote servers
- **Auth:** Vikunja API token via environment variable (no OAuth needed
  for single-user self-hosted setups)
- **Runtime:** Node.js + Express
- **SDK:** `@modelcontextprotocol/sdk` v1.x

## Requirements

- Node.js ≥ 18
- A Vikunja instance with an API token
- A publicly-accessible URL for Claude.ai to reach the server
