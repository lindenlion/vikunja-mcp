/**
 * Vikunja API Client
 *
 * Typed wrapper around the Vikunja REST API.
 * Authenticates via API token (Bearer header).
 */
// ── Client ─────────────────────────────────────────────────────────────
export class VikunjaClient {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        // Strip trailing slash and ensure /api/v1 suffix
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        if (!this.baseUrl.endsWith("/api/v1")) {
            this.baseUrl += "/api/v1";
        }
        this.token = token;
    }
    async request(method, path, body, query) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== "")
                    url.searchParams.set(k, v);
            }
        }
        const headers = {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
        };
        const res = await fetch(url.toString(), {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Vikunja API ${method} ${path} → ${res.status}: ${text}`);
        }
        // DELETE sometimes returns 204 with no body
        if (res.status === 204)
            return {};
        return (await res.json());
    }
    // ── Projects ───────────────────────────────────────────────────────
    async listProjects() {
        return this.request("GET", "/projects");
    }
    async getProject(id) {
        return this.request("GET", `/projects/${id}`);
    }
    async createProject(data) {
        return this.request("PUT", "/projects", data);
    }
    async updateProject(id, data) {
        // Vikunja replaces the full object on POST — fetch first so we don't
        // zero out fields the caller didn't mention (e.g. title when only
        // updating hex_color).
        const current = await this.getProject(id);
        return this.request("POST", `/projects/${id}`, {
            title: current.title,
            description: current.description,
            is_archived: current.is_archived,
            hex_color: current.hex_color,
            position: current.position,
            parent_project_id: current.parent_project_id,
            ...data,
        });
    }
    async deleteProject(id) {
        await this.request("DELETE", `/projects/${id}`);
    }
    // ── Tasks ──────────────────────────────────────────────────────────
    async listAllTasks(opts) {
        const query = {};
        if (opts?.page)
            query.page = String(opts.page);
        if (opts?.per_page)
            query.per_page = String(opts.per_page);
        if (opts?.sort_by)
            query.sort_by = opts.sort_by;
        if (opts?.order_by)
            query.order_by = opts.order_by;
        if (opts?.filter)
            query.filter = opts.filter;
        if (opts?.s)
            query.s = opts.s;
        return this.request("GET", "/tasks/all", undefined, query);
    }
    async getTask(id) {
        return this.request("GET", `/tasks/${id}`);
    }
    async createTask(projectId, data) {
        return this.request("PUT", `/projects/${projectId}/tasks`, data);
    }
    async updateTask(id, data) {
        // Vikunja replaces the full object on POST — fetch first so fields not
        // mentioned by the caller (e.g. due_date when only toggling done) are
        // preserved rather than zeroed out.
        const current = await this.getTask(id);
        return this.request("POST", `/tasks/${id}`, {
            title: current.title,
            description: current.description,
            done: current.done,
            priority: current.priority,
            due_date: current.due_date,
            start_date: current.start_date,
            end_date: current.end_date,
            percent_done: current.percent_done,
            is_favorite: current.is_favorite,
            position: current.position,
            repeat_after: current.repeat_after,
            ...data,
        });
    }
    async deleteTask(id) {
        await this.request("DELETE", `/tasks/${id}`);
    }
    // ── Task labels ────────────────────────────────────────────────────
    async addLabelToTask(taskId, labelId) {
        return this.request("PUT", `/tasks/${taskId}/labels`, {
            label_id: labelId,
        });
    }
    async removeLabelFromTask(taskId, labelId) {
        await this.request("DELETE", `/tasks/${taskId}/labels/${labelId}`);
    }
    // ── Labels ─────────────────────────────────────────────────────────
    async listLabels() {
        return this.request("GET", "/labels");
    }
    async createLabel(data) {
        return this.request("PUT", "/labels", data);
    }
    async deleteLabel(id) {
        await this.request("DELETE", `/labels/${id}`);
    }
    // ── Comments ───────────────────────────────────────────────────────
    async listComments(taskId) {
        return this.request("GET", `/tasks/${taskId}/comments`);
    }
    async createComment(taskId, comment) {
        return this.request("PUT", `/tasks/${taskId}/comments`, { comment });
    }
    // ── Relations ────────────────────────────────────────────────────
    async createRelation(taskId, otherTaskId, relationKind) {
        return this.request("PUT", `/tasks/${taskId}/relations`, { other_task_id: otherTaskId, relation_kind: relationKind });
    }
    async deleteRelation(taskId, otherTaskId, relationKind) {
        await this.request("DELETE", `/tasks/${taskId}/relations`, { other_task_id: otherTaskId, relation_kind: relationKind });
    }
    // ── Views ──────────────────────────────────────────────────────────
    async listViews(projectId) {
        return this.request("GET", `/projects/${projectId}/views`);
    }
}
//# sourceMappingURL=vikunja.js.map