/**
 * Vikunja MCP Server
 *
 * A remote MCP server that exposes Vikunja task-management tools
 * over Streamable HTTP. Designed to be added as a custom connector
 * in Claude.ai.
 *
 * Configuration via environment variables:
 *   VIKUNJA_URL     – Base URL of your Vikunja instance (e.g. https://vikunja.lindenlion.net)
 *   VIKUNJA_TOKEN   – API token created in Vikunja Settings > API Tokens
 *   PORT            – Port to listen on (default 3000)
 */
import express from "express";
import { timingSafeEqual } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { VikunjaClient } from "./vikunja.js";
import { loadCalendars, hasCalendars } from "./calendar.js";
// ── Config ─────────────────────────────────────────────────────────────
const VIKUNJA_URL = process.env.VIKUNJA_URL;
const VIKUNJA_TOKEN = process.env.VIKUNJA_TOKEN;
const PORT = parseInt(process.env.PORT || "3000", 10);
// Auth middleware — reject requests to this MCP without a valid token
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
if (!VIKUNJA_URL || !VIKUNJA_TOKEN) {
    console.error("Error: VIKUNJA_URL and VIKUNJA_TOKEN environment variables are required.");
    console.error("  VIKUNJA_URL   = https://vikunja.lindenlion.net");
    console.error("  VIKUNJA_TOKEN = (create one under Settings > API Tokens in Vikunja)");
    process.exit(1);
}
const vikunja = new VikunjaClient(VIKUNJA_URL, VIKUNJA_TOKEN);
// ── Helpers ────────────────────────────────────────────────────────────
function priorityLabel(p) {
    const map = {
        0: "unset",
        1: "low",
        2: "medium",
        3: "high",
        4: "urgent",
        5: "DO NOW",
    };
    return map[p] ?? String(p);
}
/** Vikunja returns "0001-01-01T00:00:00Z" for unset dates instead of null */
function isValidDate(date) {
    return !!date && !date.startsWith("0001-");
}
function formatTask(t) {
    const parts = [
        `#${t.id} ${t.done ? "✅" : "⬜"} ${t.title}`,
        t.identifier ? `  Identifier: ${t.identifier}` : "",
        `  Project: ${t.project_id}`,
        `  Priority: ${priorityLabel(t.priority)}`,
        isValidDate(t.due_date) ? `  Due: ${t.due_date}` : "",
        isValidDate(t.start_date) ? `  Start: ${t.start_date}` : "",
        isValidDate(t.end_date) ? `  End: ${t.end_date}` : "",
        t.percent_done > 0 ? `  Progress: ${Math.round(t.percent_done * 100)}%` : "",
        t.labels?.length ? `  Labels: ${t.labels.map((l) => l.title).join(", ")}` : "",
        t.assignees?.length
            ? `  Assignees: ${t.assignees.map((a) => a.name || a.username).join(", ")}`
            : "",
        t.description ? `  Description: ${t.description.slice(0, 200)}${t.description.length > 200 ? "…" : ""}` : "",
    ];
    return parts.filter(Boolean).join("\n");
}
function formatProject(p) {
    const parts = [
        `#${p.id} ${p.title}`,
        p.identifier ? `  Identifier: ${p.identifier}` : "",
        p.description ? `  Description: ${p.description.slice(0, 150)}${p.description.length > 150 ? "…" : ""}` : "",
        p.parent_project_id ? `  Parent: #${p.parent_project_id}` : "",
        p.is_archived ? `  📦 Archived` : "",
        p.is_favorite ? `  ⭐ Favorite` : "",
    ];
    return parts.filter(Boolean).join("\n");
}
function formatFilter(f) {
    const fc = f.filters;
    const parts = [
        `#${f.id} ${f.title}`,
        f.description ? `  Description: ${f.description}` : "",
        f.is_favorite ? `  ⭐ Favorite` : "",
        fc?.filter ? `  Filter: ${fc.filter}` : "",
        fc?.s ? `  Search: ${fc.s}` : "",
        fc?.sort_by?.length ? `  Sort: ${fc.sort_by.join(", ")}` : "",
    ];
    return parts.filter(Boolean).join("\n");
}
function formatNotification(n) {
    const read = isValidDate(n.read_at) ? `read ${n.read_at}` : "unread";
    return `#${n.id} [${read}] ${n.name} (${n.created})`;
}
function formatEventTime(event) {
    if (event.isAllDay)
        return "All day";
    const fmt = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${fmt(event.start)}–${fmt(event.end)}`;
}
/** Group events by date and render as a day-by-day agenda. */
function formatCalendarAgenda(sources) {
    const byDay = new Map();
    for (const source of sources) {
        if (source.error) {
            const key = "error";
            if (!byDay.has(key))
                byDay.set(key, { label: "⚠️ Errors", lines: [] });
            byDay.get(key).lines.push(`  Failed to load "${source.calendarName}": ${source.error}`);
            continue;
        }
        for (const event of source.events) {
            const dateKey = event.start.toISOString().slice(0, 10);
            if (!byDay.has(dateKey)) {
                const label = event.start.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
                byDay.set(dateKey, { label, lines: [] });
            }
            byDay.get(dateKey).lines.push(`  [${source.calendarName}] ${formatEventTime(event)}  ${event.summary}` +
                (event.location ? `  📍 ${event.location}` : ""));
        }
    }
    if (byDay.size === 0)
        return "  No events in this range.";
    return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, { label, lines }]) => `${label}:\n${lines.join("\n")}`)
        .join("\n\n");
}
// ── MCP Server factory ────────────────────────────────────────────────
function createServer() {
    const server = new McpServer({
        name: "vikunja",
        version: "1.2.0",
    });
    // ── list_projects ──────────────────────────────────────────────────
    server.tool("list_projects", "List all projects (lists) in Vikunja. Returns project IDs, titles, and metadata.", {}, async () => {
        const projects = await vikunja.listProjects();
        const text = projects.length
            ? projects.map(formatProject).join("\n\n")
            : "No projects found.";
        return { content: [{ type: "text", text }] };
    });
    // ── get_project ────────────────────────────────────────────────────
    server.tool("get_project", "Get details of a specific project by ID.", { project_id: z.number().describe("The project ID") }, async ({ project_id }) => {
        const project = await vikunja.getProject(project_id);
        return { content: [{ type: "text", text: formatProject(project) }] };
    });
    // ── create_project ─────────────────────────────────────────────────
    server.tool("create_project", "Create a new project in Vikunja.", {
        title: z.string().describe("Project title"),
        description: z.string().optional().describe("Project description"),
        parent_project_id: z.number().optional().describe("Parent project ID for nesting"),
        hex_color: z.string().optional().describe("Hex color code, e.g. 'ff6600'"),
    }, async (args) => {
        const project = await vikunja.createProject(args);
        return {
            content: [
                { type: "text", text: `Created project:\n${formatProject(project)}` },
            ],
        };
    });
    // ── update_project ─────────────────────────────────────────────────
    server.tool("update_project", "Update an existing project's title, description, archive status, or color.", {
        project_id: z.number().describe("The project ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        is_archived: z.boolean().optional().describe("Archive or unarchive"),
        hex_color: z.string().optional().describe("New hex color"),
    }, async ({ project_id, ...data }) => {
        const project = await vikunja.updateProject(project_id, data);
        return {
            content: [
                { type: "text", text: `Updated project:\n${formatProject(project)}` },
            ],
        };
    });
    // ── delete_project ─────────────────────────────────────────────────
    server.tool("delete_project", "Permanently delete a project and all its tasks. This cannot be undone!", { project_id: z.number().describe("The project ID to delete") }, async ({ project_id }) => {
        await vikunja.deleteProject(project_id);
        return {
            content: [{ type: "text", text: `Deleted project #${project_id}.` }],
        };
    });
    // ── list_tasks ─────────────────────────────────────────────────────
    server.tool("list_tasks", `List tasks across all projects, with optional filtering and search.

Filter syntax examples:
  done = false
  priority >= 3 && done = false
  due_date < now && done = false        (overdue)
  due_date > now && due_date < now+7d   (due this week)
  project_id = 5

Sort options: id, title, done, done_at, due_date, created, updated, priority, position`, {
        filter: z
            .string()
            .max(500)
            .optional()
            .describe("Vikunja filter expression, e.g. 'done = false && priority >= 3'"),
        search: z.string().optional().describe("Full-text search query"),
        sort_by: z
            .string()
            .optional()
            .describe("Field to sort by (default: position)"),
        order_by: z
            .enum(["asc", "desc"])
            .optional()
            .describe("Sort direction"),
        page: z.number().optional().describe("Page number (default 1)"),
        per_page: z
            .number()
            .optional()
            .describe("Results per page (default 50)"),
    }, async (args) => {
        const tasks = await vikunja.listAllTasks({
            filter: args.filter,
            s: args.search,
            sort_by: args.sort_by,
            order_by: args.order_by,
            page: args.page,
            per_page: args.per_page,
        });
        const text = tasks.length
            ? `Found ${tasks.length} task(s):\n\n${tasks.map(formatTask).join("\n\n")}`
            : "No tasks match the query.";
        return { content: [{ type: "text", text }] };
    });
    // ── get_task ───────────────────────────────────────────────────────
    server.tool("get_task", "Get full details of a specific task by ID, including description and comments.", { task_id: z.number().describe("The task ID") }, async ({ task_id }) => {
        const [task, comments] = await Promise.all([
            vikunja.getTask(task_id),
            vikunja.listComments(task_id).catch(() => []),
        ]);
        let text = formatTask(task);
        if (comments.length) {
            text += `\n\n  Comments (${comments.length}):\n`;
            text += comments
                .map((c) => `    ${c.author?.name || c.author?.username || "?"} (${c.created}): ${c.comment}`)
                .join("\n");
        }
        return { content: [{ type: "text", text }] };
    });
    // ── create_task ────────────────────────────────────────────────────
    server.tool("create_task", "Create a new task in a project. Priority: 0=unset, 1=low, 2=medium, 3=high, 4=urgent, 5=DO NOW. Dates must be ISO 8601 (e.g. '2026-04-10T09:00:00Z').", {
        project_id: z.number().describe("Project ID to create the task in"),
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description (supports Markdown)"),
        priority: z.number().min(0).max(5).optional().describe("Priority: 0-5"),
        due_date: z.string().optional().describe("Due date in ISO 8601 format"),
        start_date: z.string().optional().describe("Start date in ISO 8601"),
        end_date: z.string().optional().describe("End date in ISO 8601"),
        label_ids: z
            .array(z.number())
            .optional()
            .describe("Array of label IDs to attach"),
    }, async ({ project_id, label_ids, ...data }) => {
        const task = await vikunja.createTask(project_id, {
            ...data,
            labels: label_ids?.map((id) => ({ id })),
        });
        return {
            content: [
                { type: "text", text: `Created task:\n${formatTask(task)}` },
            ],
        };
    });
    // ── update_task ────────────────────────────────────────────────────
    server.tool("update_task", "Update a task's title, description, status, priority, dates, or progress.", {
        task_id: z.number().describe("The task ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        done: z.boolean().optional().describe("Mark as done (true) or not done (false)"),
        priority: z.number().min(0).max(5).optional().describe("Priority: 0-5"),
        due_date: z.string().nullable().optional().describe("Due date (ISO 8601) or null to clear"),
        start_date: z.string().nullable().optional().describe("Start date or null"),
        end_date: z.string().nullable().optional().describe("End date or null"),
        percent_done: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Progress 0.0–1.0"),
        is_favorite: z.boolean().optional().describe("Toggle favorite"),
    }, async ({ task_id, ...data }) => {
        const task = await vikunja.updateTask(task_id, data);
        return {
            content: [
                { type: "text", text: `Updated task:\n${formatTask(task)}` },
            ],
        };
    });
    // ── delete_task ────────────────────────────────────────────────────
    server.tool("delete_task", "Permanently delete a task. This cannot be undone!", { task_id: z.number().describe("The task ID to delete") }, async ({ task_id }) => {
        await vikunja.deleteTask(task_id);
        return {
            content: [{ type: "text", text: `Deleted task #${task_id}.` }],
        };
    });
    // ── complete_task (convenience) ────────────────────────────────────
    server.tool("complete_task", "Mark a task as done.", { task_id: z.number().describe("The task ID to complete") }, async ({ task_id }) => {
        const task = await vikunja.updateTask(task_id, { done: true });
        return {
            content: [
                { type: "text", text: `Completed: ${task.title} (#${task.id})` },
            ],
        };
    });
    // ── reopen_task (convenience) ──────────────────────────────────────
    server.tool("reopen_task", "Mark a task as not done (reopen it).", { task_id: z.number().describe("The task ID to reopen") }, async ({ task_id }) => {
        const task = await vikunja.updateTask(task_id, { done: false });
        return {
            content: [
                { type: "text", text: `Reopened: ${task.title} (#${task.id})` },
            ],
        };
    });
    // ── add_comment ────────────────────────────────────────────────────
    server.tool("add_comment", "Add a comment to a task.", {
        task_id: z.number().describe("The task ID"),
        comment: z.string().describe("Comment text (supports Markdown)"),
    }, async ({ task_id, comment }) => {
        const result = await vikunja.createComment(task_id, comment);
        return {
            content: [
                {
                    type: "text",
                    text: `Added comment #${result.id} to task #${task_id}.`,
                },
            ],
        };
    });
    // ── list_labels ────────────────────────────────────────────────────
    server.tool("list_labels", "List all available labels.", {}, async () => {
        const labels = await vikunja.listLabels();
        if (!labels.length) {
            return { content: [{ type: "text", text: "No labels found." }] };
        }
        const text = labels
            .map((l) => `#${l.id} ${l.title}${l.hex_color ? ` (${l.hex_color})` : ""}${l.description ? ` – ${l.description}` : ""}`)
            .join("\n");
        return { content: [{ type: "text", text }] };
    });
    // ── create_label ───────────────────────────────────────────────────
    server.tool("create_label", "Create a new label.", {
        title: z.string().describe("Label title"),
        description: z.string().optional().describe("Label description"),
        hex_color: z.string().optional().describe("Hex color, e.g. 'e8e8e8'"),
    }, async (args) => {
        const label = await vikunja.createLabel(args);
        return {
            content: [
                { type: "text", text: `Created label #${label.id}: ${label.title}` },
            ],
        };
    });
    // ── add_label_to_task ──────────────────────────────────────────────
    server.tool("add_label_to_task", "Attach an existing label to a task.", {
        task_id: z.number().describe("The task ID"),
        label_id: z.number().describe("The label ID to attach"),
    }, async ({ task_id, label_id }) => {
        await vikunja.addLabelToTask(task_id, label_id);
        return {
            content: [
                {
                    type: "text",
                    text: `Added label #${label_id} to task #${task_id}.`,
                },
            ],
        };
    });
    // ── remove_label_from_task ─────────────────────────────────────────
    server.tool("remove_label_from_task", "Remove a label from a task.", {
        task_id: z.number().describe("The task ID"),
        label_id: z.number().describe("The label ID to remove"),
    }, async ({ task_id, label_id }) => {
        await vikunja.removeLabelFromTask(task_id, label_id);
        return {
            content: [
                {
                    type: "text",
                    text: `Removed label #${label_id} from task #${task_id}.`,
                },
            ],
        };
    });
    // ── get_calendar_events ────────────────────────────────────────────
    server.tool("get_calendar_events", `Get events from all configured calendars (local .ics files and webcal subscriptions) within a date window.

Returns events grouped by day across all sources. Useful for checking your schedule, finding free time, or seeing what's coming up.

Configure sources via environment variables:
  CALENDAR_ICS_FILES – comma-separated paths to local .ics files
  CALENDAR_ICS_URLS  – comma-separated webcal/https URLs`, {
        days_back: z
            .number()
            .min(0)
            .max(365)
            .optional()
            .describe("Days in the past to include (default 0)"),
        days_ahead: z
            .number()
            .min(1)
            .max(365)
            .optional()
            .describe("Days ahead to include (default 14)"),
    }, async ({ days_back = 0, days_ahead = 14 }) => {
        if (!hasCalendars()) {
            return {
                content: [{
                        type: "text",
                        text: "No calendars configured. Set CALENDAR_ICS_FILES and/or CALENDAR_ICS_URLS in the server environment.",
                    }],
            };
        }
        const from = new Date();
        from.setDate(from.getDate() - days_back);
        from.setHours(0, 0, 0, 0);
        const to = new Date();
        to.setDate(to.getDate() + days_ahead);
        to.setHours(23, 59, 59, 999);
        const sources = await loadCalendars(from, to);
        const totalEvents = sources.reduce((n, s) => n + s.events.length, 0);
        const header = `📅 Calendar — ${days_back > 0 ? `last ${days_back}d + ` : ""}next ${days_ahead} day(s) · ${totalEvents} event(s) across ${sources.length} calendar(s)\n`;
        return {
            content: [{ type: "text", text: header + "\n" + formatCalendarAgenda(sources) }],
        };
    });
    // ── weekly_review ──────────────────────────────────────────────────
    server.tool("weekly_review", "Generate a weekly review summary: overdue tasks, tasks due this week, high-priority open tasks, and recently completed tasks.", {}, async () => {
        const [overdueR, dueThisWeekR, highPriorityR, recentlyDoneR] = await Promise.allSettled([
            vikunja.listAllTasks({
                filter: "due_date < now && done = false",
                sort_by: "due_date",
                order_by: "asc",
            }),
            vikunja.listAllTasks({
                filter: "due_date > now && due_date < now+7d && done = false",
                sort_by: "due_date",
                order_by: "asc",
            }),
            vikunja.listAllTasks({
                filter: "priority >= 3 && done = false",
                sort_by: "priority",
                order_by: "desc",
            }),
            vikunja.listAllTasks({
                filter: "done = true && done_at > now-7d",
                sort_by: "done_at",
                order_by: "desc",
            }),
        ]);
        const resolve = (r) => r.status === "fulfilled" ? r.value : [];
        const queryErr = (r) => r.status === "rejected" ? `  ⚠️ Query failed: ${r.reason}` : null;
        const overdue = resolve(overdueR);
        const dueThisWeek = resolve(dueThisWeekR);
        const highPriority = resolve(highPriorityR);
        const recentlyDone = resolve(recentlyDoneR);
        // Calendar events for the week (optional — gracefully absent if not configured)
        let calendarSection = "";
        if (hasCalendars()) {
            const now = new Date();
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + 7);
            weekEnd.setHours(23, 59, 59, 999);
            const calSources = await loadCalendars(now, weekEnd).catch(() => []);
            const totalCalEvents = calSources.reduce((n, s) => n + s.events.length, 0);
            calendarSection = `\n📅 THIS WEEK'S CALENDAR (${totalCalEvents}):\n` +
                formatCalendarAgenda(calSources);
        }
        const sections = [];
        sections.push(`── WEEKLY REVIEW ──\n`);
        if (calendarSection)
            sections.push(calendarSection);
        sections.push(`\n🔴 OVERDUE (${overdue.length}):`);
        sections.push(queryErr(overdueR) ??
            (overdue.length ? overdue.map(formatTask).join("\n\n") : "  None – you're all caught up!"));
        sections.push(`\n📅 TASKS DUE THIS WEEK (${dueThisWeek.length}):`);
        sections.push(queryErr(dueThisWeekR) ??
            (dueThisWeek.length ? dueThisWeek.map(formatTask).join("\n\n") : "  Nothing due this week."));
        sections.push(`\n🔥 HIGH PRIORITY OPEN (${highPriority.length}):`);
        sections.push(queryErr(highPriorityR) ??
            (highPriority.length ? highPriority.map(formatTask).join("\n\n") : "  No high-priority tasks."));
        sections.push(`\n✅ COMPLETED THIS WEEK (${recentlyDone.length}):`);
        sections.push(queryErr(recentlyDoneR) ??
            (recentlyDone.length ? recentlyDone.map(formatTask).join("\n\n") : "  Nothing completed yet this week."));
        return { content: [{ type: "text", text: sections.join("\n") }] };
    });
    // ── bulk_update_tasks ─────────────────────────────────────────────
    server.tool("bulk_update_tasks", `Update multiple tasks at once. Only the fields you specify are changed — other fields are left untouched.

Examples:
  Mark tasks #1, #2, #3 as done: task_ids=[1,2,3], done=true
  Set all FIIERCE sprint tasks to high priority: task_ids=[...], priority=3`, {
        task_ids: z.array(z.number()).describe("Array of task IDs to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        done: z.boolean().optional().describe("Mark as done or not done"),
        priority: z.number().min(0).max(5).optional().describe("Priority: 0-5"),
        due_date: z.string().nullable().optional().describe("Due date (ISO 8601) or null to clear"),
        start_date: z.string().nullable().optional().describe("Start date or null"),
        end_date: z.string().nullable().optional().describe("End date or null"),
        percent_done: z.number().min(0).max(1).optional().describe("Progress 0.0–1.0"),
        is_favorite: z.boolean().optional().describe("Toggle favorite"),
    }, async ({ task_ids, ...rest }) => {
        const values = {};
        const fields = [];
        for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) {
                values[k] = v;
                fields.push(k);
            }
        }
        const tasks = await vikunja.bulkUpdateTasks(task_ids, values, fields);
        return {
            content: [{
                    type: "text",
                    text: `Updated ${tasks.length} task(s):\n\n${tasks.map(formatTask).join("\n\n")}`,
                }],
        };
    });
    // ── get_notifications ─────────────────────────────────────────────
    server.tool("get_notifications", "Get all notifications for the current user. Useful for seeing what has changed recently — new comments, task assignments, etc.", {}, async () => {
        const notifications = await vikunja.listNotifications();
        if (!notifications.length) {
            return { content: [{ type: "text", text: "No notifications." }] };
        }
        const unread = notifications.filter((n) => !isValidDate(n.read_at));
        const text = [
            `${notifications.length} notification(s), ${unread.length} unread:\n`,
            ...notifications.map(formatNotification),
        ].join("\n");
        return { content: [{ type: "text", text }] };
    });
    // ── create_filter ─────────────────────────────────────────────────
    server.tool("create_filter", "Save a named filter for reuse. Saved filters appear alongside projects in Vikunja. Use the same filter expression syntax as list_tasks.", {
        title: z.string().describe("Filter name"),
        description: z.string().optional().describe("Filter description"),
        filter: z.string().max(500).optional().describe("Filter expression, e.g. 'priority >= 3 && done = false'"),
        sort_by: z.string().optional().describe("Field to sort by"),
        order_by: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
        is_favorite: z.boolean().optional().describe("Show in favorites"),
    }, async ({ title, description, filter, sort_by, order_by, is_favorite }) => {
        const saved = await vikunja.createFilter({
            title,
            description,
            is_favorite,
            filters: { filter, sort_by, order_by },
        });
        return { content: [{ type: "text", text: `Created filter:\n${formatFilter(saved)}` }] };
    });
    // ── get_filter ────────────────────────────────────────────────────
    server.tool("get_filter", "Get a saved filter by ID.", { filter_id: z.number().describe("The filter ID") }, async ({ filter_id }) => {
        const saved = await vikunja.getFilter(filter_id);
        return { content: [{ type: "text", text: formatFilter(saved) }] };
    });
    // ── update_filter ─────────────────────────────────────────────────
    server.tool("update_filter", "Update a saved filter's title, description, expression, or favorite status.", {
        filter_id: z.number().describe("The filter ID to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        filter: z.string().max(500).optional().describe("New filter expression"),
        sort_by: z.string().optional().describe("New sort field"),
        order_by: z.enum(["asc", "desc"]).optional().describe("New sort direction"),
        is_favorite: z.boolean().optional().describe("Toggle favorite"),
    }, async ({ filter_id, filter, sort_by, order_by, ...rest }) => {
        const saved = await vikunja.updateFilter(filter_id, {
            ...rest,
            ...(filter !== undefined || sort_by !== undefined || order_by !== undefined
                ? { filters: { filter, sort_by, order_by } }
                : {}),
        });
        return { content: [{ type: "text", text: `Updated filter:\n${formatFilter(saved)}` }] };
    });
    // ── delete_filter ─────────────────────────────────────────────────
    server.tool("delete_filter", "Permanently delete a saved filter.", { filter_id: z.number().describe("The filter ID to delete") }, async ({ filter_id }) => {
        await vikunja.deleteFilter(filter_id);
        return { content: [{ type: "text", text: `Deleted filter #${filter_id}.` }] };
    });
    // ── get_calendar ──────────────────────────────────────────────────
    server.tool("get_calendar", `Get an agenda view of tasks that have due dates. Shows overdue and upcoming tasks grouped by urgency.`, {
        days: z
            .number()
            .min(1)
            .max(365)
            .optional()
            .describe("Days ahead to look (default 30)"),
        include_overdue: z
            .boolean()
            .optional()
            .describe("Include overdue tasks (default true)"),
    }, async ({ days = 30, include_overdue = true }) => {
        const [upcoming, overdue] = await Promise.all([
            vikunja
                .listAllTasks({
                filter: `due_date > now && due_date < now+${days}d && done = false`,
                sort_by: "due_date",
                order_by: "asc",
                per_page: 200,
            })
                .catch(() => []),
            include_overdue
                ? vikunja
                    .listAllTasks({
                    filter: "due_date < now && done = false",
                    sort_by: "due_date",
                    order_by: "asc",
                    per_page: 100,
                })
                    .catch(() => [])
                : Promise.resolve([]),
        ]);
        const sections = [
            `📅 Calendar Agenda — next ${days} day(s)\n`,
        ];
        if (overdue.length > 0) {
            sections.push(`🔴 OVERDUE (${overdue.length}):`);
            sections.push(overdue.map(formatTask).join("\n\n"));
        }
        if (upcoming.length > 0) {
            sections.push(`\n📆 UPCOMING (${upcoming.length}):`);
            sections.push(upcoming.map(formatTask).join("\n\n"));
        }
        if (overdue.length === 0 && upcoming.length === 0) {
            sections.push("No tasks with due dates found in this range.");
        }
        return { content: [{ type: "text", text: sections.join("\n") }] };
    });
    // ── create_relation ─────────────────────────────────────────────
    server.tool("create_relation", `Create a relation between two tasks. This is how you create subtasks, blocking dependencies, etc.

Relation kinds (use the code value):
  subtask     – other task is a subtask of this task
  parenttask  – other task is the parent of this task
  related     – tasks are related (symmetric)
  blocking    – this task blocks the other task
  blocked     – this task is blocked by the other task
  precedes    – this task comes before the other task
  follows     – this task comes after the other task
  duplicateof – this task is a duplicate of the other
  duplicates  – other task duplicates this task
  copiedfrom  – this task was copied from the other
  copiedto    – this task was copied to the other

Example: to make task #2 a subtask of task #1, call with task_id=1, other_task_id=2, relation_kind="subtask".`, {
        task_id: z.number().describe("The task ID to create the relation on"),
        other_task_id: z.number().describe("The other task ID to relate to"),
        relation_kind: z
            .enum([
            "subtask",
            "parenttask",
            "related",
            "duplicateof",
            "duplicates",
            "blocking",
            "blocked",
            "precedes",
            "follows",
            "copiedfrom",
            "copiedto",
        ])
            .describe("The type of relation"),
    }, async ({ task_id, other_task_id, relation_kind }) => {
        await vikunja.createRelation(task_id, other_task_id, relation_kind);
        return {
            content: [
                {
                    type: "text",
                    text: `Created relation: task #${other_task_id} is ${relation_kind} of task #${task_id}.`,
                },
            ],
        };
    });
    // ── remove_relation ────────────────────────────────────────────────
    server.tool("remove_relation", "Remove a relation between two tasks.", {
        task_id: z.number().describe("The task ID"),
        other_task_id: z.number().describe("The other task ID"),
        relation_kind: z
            .enum([
            "subtask",
            "parenttask",
            "related",
            "duplicateof",
            "duplicates",
            "blocking",
            "blocked",
            "precedes",
            "follows",
            "copiedfrom",
            "copiedto",
        ])
            .describe("The type of relation to remove"),
    }, async ({ task_id, other_task_id, relation_kind }) => {
        await vikunja.deleteRelation(task_id, other_task_id, relation_kind);
        return {
            content: [
                {
                    type: "text",
                    text: `Removed ${relation_kind} relation between task #${task_id} and task #${other_task_id}.`,
                },
            ],
        };
    });
    return server;
}
// ── HTTP Server ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/mcp", (req, res, next) => {
    if (AUTH_TOKEN) {
        const provided = String(req.query.token ?? "");
        const valid = provided.length === AUTH_TOKEN.length &&
            timingSafeEqual(Buffer.from(provided), Buffer.from(AUTH_TOKEN));
        if (!valid) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
    }
    next();
});
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "vikunja-mcp", version: "1.2.0" });
});
// Stateless Streamable HTTP: each POST creates a fresh server + transport
app.post("/mcp", async (req, res) => {
    try {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }
    catch (err) {
        console.error("MCP request error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});
// Handle GET and DELETE for protocol completeness
app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST for MCP requests." });
});
app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Stateless server has no sessions to delete." });
});
app.listen(PORT, "0.0.0.0", () => {
    console.error(`✓ Vikunja MCP server listening on port ${PORT}`);
    console.error(`  Health: http://localhost:${PORT}/health`);
    console.error(`  MCP:    http://localhost:${PORT}/mcp`);
    console.error(`  Vikunja: ${VIKUNJA_URL}`);
});
//# sourceMappingURL=index.js.map