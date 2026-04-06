/**
 * Vikunja API Client
 *
 * Typed wrapper around the Vikunja REST API.
 * Authenticates via API token (Bearer header).
 */
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
export declare class VikunjaClient {
    private baseUrl;
    private token;
    constructor(baseUrl: string, token: string);
    private request;
    listProjects(): Promise<VikunjaProject[]>;
    getProject(id: number): Promise<VikunjaProject>;
    createProject(data: {
        title: string;
        description?: string;
        parent_project_id?: number;
        hex_color?: string;
    }): Promise<VikunjaProject>;
    updateProject(id: number, data: Partial<{
        title: string;
        description: string;
        is_archived: boolean;
        hex_color: string;
    }>): Promise<VikunjaProject>;
    deleteProject(id: number): Promise<void>;
    listAllTasks(opts?: {
        page?: number;
        per_page?: number;
        sort_by?: string;
        order_by?: string;
        filter?: string;
        s?: string;
    }): Promise<VikunjaTask[]>;
    getTask(id: number): Promise<VikunjaTask>;
    createTask(projectId: number, data: {
        title: string;
        description?: string;
        priority?: number;
        due_date?: string;
        start_date?: string;
        end_date?: string;
        labels?: Array<{
            id: number;
        }>;
    }): Promise<VikunjaTask>;
    updateTask(id: number, data: Partial<{
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
    }>): Promise<VikunjaTask>;
    deleteTask(id: number): Promise<void>;
    addLabelToTask(taskId: number, labelId: number): Promise<unknown>;
    removeLabelFromTask(taskId: number, labelId: number): Promise<void>;
    listLabels(): Promise<VikunjaLabel[]>;
    createLabel(data: {
        title: string;
        description?: string;
        hex_color?: string;
    }): Promise<VikunjaLabel>;
    deleteLabel(id: number): Promise<void>;
    listComments(taskId: number): Promise<VikunjaComment[]>;
    createComment(taskId: number, comment: string): Promise<VikunjaComment>;
    createRelation(taskId: number, otherTaskId: number, relationKind: string): Promise<unknown>;
    deleteRelation(taskId: number, otherTaskId: number, relationKind: string): Promise<void>;
    listViews(projectId: number): Promise<VikunjaView[]>;
}
