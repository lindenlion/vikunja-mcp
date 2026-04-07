/**
 * Vikunja API Client
 *
 * Typed wrapper around the Vikunja REST API.
 * Authenticates via API token (Bearer header).
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface VikunjaUser {
  id: number;
  name: string;
  username: string;
  email?: string;
  created: string;
  updated: string;
}

export interface VikunjaLabel {
  id: number;
  title: string;
  description: string;
  hex_color: string;
  created_by: VikunjaUser;
  created: string;
  updated: string;
}

export interface VikunjaProject {
  id: number;
  title: string;
  description: string;
  identifier: string;
  hex_color: string;
  parent_project_id: number;
  is_archived: boolean;
  is_favorite: boolean;
  position: number;
  created: string;
  updated: string;
  owner: VikunjaUser;
}

export interface VikunjaTask {
  id: number;
  title: string;
  description: string;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  labels: VikunjaLabel[] | null;
  assignees: VikunjaUser[] | null;
  project_id: number;
  repeat_after: number;
  percent_done: number;
  identifier: string;
  is_favorite: boolean;
  position: number;
  kanban_position: number;
  bucket_id: number;
  created: string;
  updated: string;
  created_by: VikunjaUser;
}

export interface VikunjaComment {
  id: number;
  comment: string;
  author: VikunjaUser;
  created: string;
  updated: string;
}

export interface VikunjaSavedFilter {
  id: number;
  title: string;
  description: string;
  is_favorite: boolean;
  filters: {
    filter?: string;
    filter_include_nulls?: boolean;
    sort_by?: string[];
    order_by?: string[];
    s?: string;
  };
  owner: VikunjaUser;
  created: string;
  updated: string;
}

export interface VikunjaNotification {
  id: number;
  name: string;
  notification: unknown;
  read_at: string | null;
  created: string;
}

export interface VikunjaView {
  id: number;
  title: string;
  project_id: number;
  view_kind: number;
  filter: string;
  position: number;
  bucket_configuration_mode: number;
  default_bucket_id: number;
  done_bucket_id: number;
  created: string;
  updated: string;
}

// ── Client ─────────────────────────────────────────────────────────────

export class VikunjaClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash and ensure /api/v1 suffix
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (!this.baseUrl.endsWith("/api/v1")) {
      this.baseUrl += "/api/v1";
    }
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
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
      console.error(`Vikunja API ${method} ${path} → ${res.status}: ${text}`);
      throw new Error(`Vikunja API request failed: ${res.status}`);
    }

    // DELETE sometimes returns 204 with no body
    if (res.status === 204) return {} as T;

    return (await res.json()) as T;
  }

  // ── Projects ───────────────────────────────────────────────────────

  async listProjects(): Promise<VikunjaProject[]> {
    return this.request<VikunjaProject[]>("GET", "/projects");
  }

  async getProject(id: number): Promise<VikunjaProject> {
    return this.request<VikunjaProject>("GET", `/projects/${id}`);
  }

  async createProject(data: {
    title: string;
    description?: string;
    parent_project_id?: number;
    hex_color?: string;
  }): Promise<VikunjaProject> {
    return this.request<VikunjaProject>("PUT", "/projects", data);
  }

  async updateProject(
    id: number,
    data: Partial<{
      title: string;
      description: string;
      is_archived: boolean;
      hex_color: string;
    }>
  ): Promise<VikunjaProject> {
    // Vikunja replaces the full object on POST — fetch first so we don't
    // zero out fields the caller didn't mention (e.g. title when only
    // updating hex_color).
    const current = await this.getProject(id);
    return this.request<VikunjaProject>("POST", `/projects/${id}`, {
      title: current.title,
      description: current.description,
      is_archived: current.is_archived,
      hex_color: current.hex_color,
      position: current.position,
      parent_project_id: current.parent_project_id,
      ...data,
    });
  }

  async deleteProject(id: number): Promise<void> {
    await this.request<void>("DELETE", `/projects/${id}`);
  }

  // ── Tasks ──────────────────────────────────────────────────────────

  async listAllTasks(opts?: {
    page?: number;
    per_page?: number;
    sort_by?: string;
    order_by?: string;
    filter?: string;
    s?: string;
  }): Promise<VikunjaTask[]> {
    const query: Record<string, string> = {};
    if (opts?.page) query.page = String(opts.page);
    if (opts?.per_page) query.per_page = String(opts.per_page);
    if (opts?.sort_by) query.sort_by = opts.sort_by;
    if (opts?.order_by) query.order_by = opts.order_by;
    if (opts?.filter) query.filter = opts.filter;
    if (opts?.s) query.s = opts.s;
    return this.request<VikunjaTask[]>("GET", "/tasks", undefined, query);
  }

  async getTask(id: number): Promise<VikunjaTask> {
    return this.request<VikunjaTask>("GET", `/tasks/${id}`);
  }

  async createTask(
    projectId: number,
    data: {
      title: string;
      description?: string;
      priority?: number;
      due_date?: string;
      start_date?: string;
      end_date?: string;
      labels?: Array<{ id: number }>;
    }
  ): Promise<VikunjaTask> {
    return this.request<VikunjaTask>(
      "PUT",
      `/projects/${projectId}/tasks`,
      data
    );
  }

  async updateTask(
    id: number,
    data: Partial<{
      title: string;
      description: string;
      done: boolean;
      priority: number;
      due_date: string | null;
      start_date: string | null;
      end_date: string | null;
      percent_done: number;
      is_favorite: boolean;
      position: number;
    }>
  ): Promise<VikunjaTask> {
    // Vikunja replaces the full object on POST — fetch first so fields not
    // mentioned by the caller (e.g. due_date when only toggling done) are
    // preserved rather than zeroed out.
    const current = await this.getTask(id);
    return this.request<VikunjaTask>("POST", `/tasks/${id}`, {
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

  async deleteTask(id: number): Promise<void> {
    await this.request<void>("DELETE", `/tasks/${id}`);
  }

  // ── Task labels ────────────────────────────────────────────────────

  async addLabelToTask(taskId: number, labelId: number): Promise<unknown> {
    return this.request("PUT", `/tasks/${taskId}/labels`, {
      label_id: labelId,
    });
  }

  async removeLabelFromTask(
    taskId: number,
    labelId: number
  ): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/tasks/${taskId}/labels/${labelId}`
    );
  }

  // ── Labels ─────────────────────────────────────────────────────────

  async listLabels(): Promise<VikunjaLabel[]> {
    return this.request<VikunjaLabel[]>("GET", "/labels");
  }

  async createLabel(data: {
    title: string;
    description?: string;
    hex_color?: string;
  }): Promise<VikunjaLabel> {
    return this.request<VikunjaLabel>("PUT", "/labels", data);
  }

  async deleteLabel(id: number): Promise<void> {
    await this.request<void>("DELETE", `/labels/${id}`);
  }

  // ── Comments ───────────────────────────────────────────────────────

  async listComments(taskId: number): Promise<VikunjaComment[]> {
    return this.request<VikunjaComment[]>(
      "GET",
      `/tasks/${taskId}/comments`
    );
  }

  async createComment(
    taskId: number,
    comment: string
  ): Promise<VikunjaComment> {
    return this.request<VikunjaComment>(
      "PUT",
      `/tasks/${taskId}/comments`,
      { comment }
    );
  }

  // ── Relations ────────────────────────────────────────────────────

  async createRelation(
    taskId: number,
    otherTaskId: number,
    relationKind: string
  ): Promise<unknown> {
    return this.request(
      "PUT",
      `/tasks/${taskId}/relations`,
      { other_task_id: otherTaskId, relation_kind: relationKind }
    );
  }

  async deleteRelation(
    taskId: number,
    otherTaskId: number,
    relationKind: string
  ): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/tasks/${taskId}/relations/${relationKind}/${otherTaskId}`
    );
  }

  // ── Bulk tasks ─────────────────────────────────────────────────────

  async bulkUpdateTasks(
    taskIds: number[],
    values: Partial<{
      title: string;
      description: string;
      done: boolean;
      priority: number;
      due_date: string | null;
      start_date: string | null;
      end_date: string | null;
      percent_done: number;
      is_favorite: boolean;
    }>,
    fields?: string[]
  ): Promise<VikunjaTask[]> {
    return this.request<VikunjaTask[]>("POST", "/tasks/bulk", {
      task_ids: taskIds,
      values,
      ...(fields?.length ? { fields } : {}),
    });
  }

  // ── Notifications ──────────────────────────────────────────────────

  async listNotifications(): Promise<VikunjaNotification[]> {
    return this.request<VikunjaNotification[]>("GET", "/notifications");
  }

  // ── Saved filters ──────────────────────────────────────────────────

  async createFilter(data: {
    title: string;
    description?: string;
    is_favorite?: boolean;
    filters?: {
      filter?: string;
      sort_by?: string;
      order_by?: string;
      s?: string;
    };
  }): Promise<VikunjaSavedFilter> {
    return this.request<VikunjaSavedFilter>("PUT", "/filters", data);
  }

  async getFilter(id: number): Promise<VikunjaSavedFilter> {
    return this.request<VikunjaSavedFilter>("GET", `/filters/${id}`);
  }

  async updateFilter(
    id: number,
    data: Partial<{
      title: string;
      description: string;
      is_favorite: boolean;
      filters: {
        filter?: string;
        sort_by?: string;
        order_by?: string;
        s?: string;
      };
    }>
  ): Promise<VikunjaSavedFilter> {
    const current = await this.getFilter(id);
    return this.request<VikunjaSavedFilter>("POST", `/filters/${id}`, {
      title: current.title,
      description: current.description,
      is_favorite: current.is_favorite,
      filters: current.filters,
      ...data,
    });
  }

  async deleteFilter(id: number): Promise<void> {
    await this.request<void>("DELETE", `/filters/${id}`);
  }

  // ── Views ──────────────────────────────────────────────────────────

  async listViews(projectId: number): Promise<VikunjaView[]> {
    return this.request<VikunjaView[]>(
      "GET",
      `/projects/${projectId}/views`
    );
  }
}
