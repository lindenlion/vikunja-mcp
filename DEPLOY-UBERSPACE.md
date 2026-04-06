# Deploying vikunja-mcp on Uberspace

This guide gets the MCP server running at `https://mcp.vikunja.lindenlion.net`
so you can add it as a custom connector in Claude.ai.

## 1. Upload the project

```bash
# From your local machine
scp -r vikunja-mcp/ lindenlion@lindenlion.uber.space:~/vikunja-mcp
```

Or clone / copy just the source files. The key files are:

```
vikunja-mcp/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── index.ts
    └── vikunja.ts
```

## 2. Install dependencies and build

```bash
ssh lindenlion@lindenlion.uber.space

cd ~/vikunja-mcp
npm install
npm run build
```

This compiles TypeScript into `build/`.

## 3. Configure the environment

```bash
cp .env.example .env
nano .env
```

Set your real values and choose an unused port. Check which ports are free:

```bash
# Pick a port between 1024–65535 that isn't in use
ss -tlnp | grep LISTEN
```

**`VIKUNJA_TOKEN`** — create one in Vikunja under Settings > API Tokens with
read/write access to tasks, projects, and labels.

**`MCP_AUTH_TOKEN`** — a shared secret that protects the `/mcp` endpoint from
unauthorized access. Generate a strong value:

```bash
openssl rand -hex 32
```

Paste the output into `.env` as `MCP_AUTH_TOKEN`. Keep it secret — anyone with
this token can use your Vikunja account through the MCP server.

## 4. Test it manually

```bash
# Source the env and run
export $(grep -v '^#' .env | xargs)
node build/index.js
```

In another terminal:
```bash
curl http://localhost:9090/health
# Should return: {"status":"ok","server":"vikunja-mcp","version":"1.0.0"}

# Optional: test the iCal feed
curl -s http://localhost:9090/calendar.ics | head -5
# Should start with: BEGIN:VCALENDAR
```

Press Ctrl+C to stop.

## 5. Set up as a daemon (supervisord)

Uberspace uses supervisord to manage long-running processes.

```bash
cat > ~/etc/services.d/vikunja-mcp.ini << 'EOF'
[program:vikunja-mcp]
command=bash -c 'export $(grep -v "^#" %(ENV_HOME)s/vikunja-mcp/.env | xargs) && exec node %(ENV_HOME)s/vikunja-mcp/build/index.js'
autostart=yes
autorestart=yes
startsecs=10
EOF
```

Then reload and start:

```bash
supervisorctl reread
supervisorctl update
supervisorctl status vikunja-mcp
```

Check logs:
```bash
supervisorctl tail -f vikunja-mcp
```

## 6. Set up the web backend (reverse proxy)

Uberspace makes this straightforward. Register a web backend for your subdomain:

```bash
# Replace 9090 with whatever PORT you set in .env
uberspace web backend set mcp.vikunja.lindenlion.net --http --port 9090
```

Verify it:
```bash
uberspace web backend list
```

Now `https://mcp.vikunja.lindenlion.net/mcp` routes to your MCP server.

Test it:
```bash
curl https://mcp.vikunja.lindenlion.net/health
```

## 7. DNS setup

If you haven't already, add a DNS record for the subdomain:

```
mcp.vikunja.lindenlion.net.  CNAME  lindenlion.uber.space.
```

Uberspace handles the TLS certificate automatically via Let's Encrypt.

## 8. Connect in Claude.ai

1. Go to **Settings > Connectors** in Claude.ai
2. Click **"Add custom connector"**
3. Enter the URL — append your `MCP_AUTH_TOKEN` as a query parameter:
   ```
   https://mcp.vikunja.lindenlion.net/mcp?token=your-long-random-token-here
   ```
4. Name it something like "Vikunja"
5. Click **Add**

The connector should now appear in your conversation toggles.
Enable it in a chat and try: _"Show me my overdue tasks in Vikunja"_

### Optional: subscribe to the iCal calendar feed

In any calendar app that supports webcal subscriptions (macOS Calendar, Thunderbird, etc.):

```
webcal://mcp.vikunja.lindenlion.net/calendar.ics
```

This feed includes all open tasks and tasks completed in the last 30 days that
have a date set. Your calendar app will poll it automatically.

## Updating

When you change the code:

```bash
cd ~/vikunja-mcp
npm run build
supervisorctl restart vikunja-mcp
```

## Troubleshooting

**"502 Bad Gateway"** → The Node process isn't running.
Check `supervisorctl status vikunja-mcp` and logs.

**"Vikunja API error 401"** → Your API token is wrong or expired.
Create a new one in Vikunja and update `.env`, then restart.

**"Connection refused in Claude"** → Make sure the web backend is set
and DNS is pointing to Uberspace.

**Anthropic can't reach the server** → The server must be publicly
accessible. Uberspace handles this, but double check with:
```bash
curl -X POST https://mcp.vikunja.lindenlion.net/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```
