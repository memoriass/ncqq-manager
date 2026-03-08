/**
 * 统一 API 客户端
 * 封装所有后端 API 调用，提供类型安全和错误处理
 */

// ============ 类型定义 ============

export interface Container {
    id: string;
    name: string;
    status: string;
    image: string;
    created: string;
    node_id: string;
    uin?: string;
}

export interface ContainerStats {
    status: string;
    created: string;
    cpu_percent: number;
    mem_usage: number;
    mem_limit: number;
    uin: string;
    version: string;
    webui_token: string;
    webui_port: number;
    platform: string;
    uptime_formatted: string;
    network_endpoints: {
        http: number;
        ws: number;
        http_client: number;
        ws_client: number;
    };
}

export interface Node {
    id: string;
    name: string;
    address: string;
    api_key: string;
    status?: string;
    container_count?: number;
    ping?: number;
    system?: {
        cpu_percent: number;
        mem_percent: number;
        platform: string;
        python_version: string;
        app_version?: string;
    };
    instances?: {
        total: number;
        running: number;
    };
    chart?: {
        cpu: number[];
        mem: number[];
    };
}

export interface InstanceRef {
    node_id: string;
    container_name: string;
}

export interface User {
    uuid: string;
    userName: string;
    permission: number;
    api_key?: string;
    instances?: InstanceRef[];
}

export interface AuthUser {
    uuid: string;
    userName: string;
    permission: number;
}

export interface OperationLog {
    id: string;
    type: string;
    level: 'info' | 'warning' | 'error';
    time: string;
    timestamp: number;
    operator?: string;
    operator_ip?: string;
    target?: string;
    [key: string]: unknown;
}

export interface FileItem {
    name: string;
    size: number;
    mtime: number;
}

export interface FolderItem {
    name: string;
}

export interface ClusterConfig {
    base_port: number;
    docker_image: string;
    data_dir: string;
    api_key: string;
}

export interface CreateContainerRequest {
    name: string;
    node_id?: string;
    docker_image?: string;
    webui_port?: number;
    http_port?: number;
    ws_port?: number;
    memory_limit?: number;
    restart_policy?: string;
    network_mode?: string;
    env_vars?: string[];
}

export interface UserEditPayload {
    userName?: string;
    passWord?: string;
    permission?: number;
}

export interface DockerImage {
    id: string;
    tags: string[];
    size: number;
    created: string;
}

export interface AlertRule {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    config: Record<string, unknown>;
    webhook_url: string;
    created_at: number;
}

export interface AlertHistory {
    id: number;
    rule_id: string;
    message: string;
    level: string;
    created_at: number;
}

const API_BASE = '/api';

// 认证错误类 — 供上层区分 401 和其他异常
export class AuthError extends Error {
    constructor(message: string = 'Unauthorized') {
        super(message);
        this.name = 'AuthError';
    }
}

// 通用请求封装
async function request<T>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        },
    });

    if (response.status === 401) {
        // 触发全局事件，让路由层决定如何处理
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new AuthError();
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// ============ 公开 API（无需认证） ============

export const publicApi = {
    // 公开容器列表 - 返回基本状态与登录信息
    containers: async (): Promise<{ status: string; containers: Container[] }> => {
        const response = await fetch(`${API_BASE}/public/containers`, {
            credentials: 'include',
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    },

    // 获取二维码（不走 request 封装，避免 401 事件）— 单实例管理页面用
    getQR: async (name: string, nodeId: string = 'local'): Promise<{ status: string; url?: string; type?: string; uin?: string }> => {
        const response = await fetch(`${API_BASE}/containers/${name}/qrcode?node_id=${nodeId}`, {
            credentials: 'include',
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    },

    // 批量获取所有容器的 QR 状态（用户面板用，一次请求替代 N 个独立请求）
    batchQR: async (): Promise<{ status: string; items: Record<string, { status: string; url?: string; type?: string; uin?: string }> }> => {
        const response = await fetch(`${API_BASE}/public/qr/batch`, {
            credentials: 'include',
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    },

    // 刷新登录状态（不走 request 封装，用户面板无需认证）
    refreshLogin: async (name: string, nodeId: string = 'local'): Promise<{
        status: string; logged_in: boolean; uin?: string; nickname?: string; method?: string;
    }> => {
        const response = await fetch(`${API_BASE}/containers/${name}/refresh-login?node_id=${nodeId}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    },
};

// ============ 容器相关 API ============

export const containerApi = {
    // 获取容器列表
    list: (nodeId?: string) =>
        request<{ status: string; containers: Container[] }>(
            nodeId ? `/containers?node_id=${nodeId}` : '/containers'
        ),

    // 获取容器统计信息
    getStats: (name: string, nodeId: string = 'local') =>
        request<ContainerStats>(`/containers/${name}/stats?node_id=${nodeId}`),

    // 批量获取所有容器统计（后端并行+超时隔离，替代逐一请求）
    getBatchStats: () =>
        request<{ status: string; stats: Record<string, ContainerStats> }>('/containers/stats/batch'),

    // 获取容器日志
    getLogs: (name: string, lines: number = 200, nodeId: string = 'local') =>
        request<{ status: string; logs: string }>(`/containers/${name}/logs?lines=${lines}&node_id=${nodeId}`),

    // 容器操作 (start/stop/restart/delete)
    action: (name: string, action: string, nodeId: string = 'local', deleteData: boolean = false) =>
        request<{ status: string }>(`/containers/${name}/action?action=${action}&node_id=${nodeId}&delete_data=${deleteData}`, {
            method: 'POST',
        }),

    // 创建容器
    create: (data: CreateContainerRequest) =>
        request<{ status: string; container_id: string }>('/containers', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // 获取二维码
    getQR: (name: string, nodeId: string = 'local') =>
        request<{ status: string; url?: string; type?: string; uin?: string }>(`/containers/${name}/qrcode?node_id=${nodeId}`),

    // 刷新登录状态（管理员用，走 request 封装含 401 处理）
    refreshLogin: (name: string, nodeId: string = 'local') =>
        request<{ status: string; logged_in: boolean; uin?: string; nickname?: string; method?: string }>(
            `/containers/${name}/refresh-login?node_id=${nodeId}`, { method: 'POST' }
        ),

    // 获取配置文件
    getConfig: (name: string, filename: string, nodeId: string = 'local') =>
        request<{ status: string; content: string }>(`/containers/${name}/config/${filename}?node_id=${nodeId}`),

    // 保存配置文件
    saveConfig: (name: string, filename: string, content: string, nodeId: string = 'local') =>
        request<{ status: string }>(`/containers/${name}/config/${filename}?node_id=${nodeId}`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        }),

    // 获取文件列表
    listFiles: (name: string, path: string = '', nodeId: string = 'local') =>
        request<{ status: string; files: FileItem[]; folders: FolderItem[]; current_path: string }>(
            `/containers/${name}/files?path=${encodeURIComponent(path)}&node_id=${nodeId}`
        ),
};

// ============ 节点相关 API ============

export const nodeApi = {
    // 获取节点列表
    list: () => request<{ status: string; nodes: Node[] }>('/nodes'),

    // 添加节点
    add: (name: string, address: string, apiKey: string) =>
        request<{ status: string }>('/nodes', {
            method: 'POST',
            body: JSON.stringify({ name, address, api_key: apiKey }),
        }),

    // 编辑节点
    edit: (nodeId: string, name: string, address: string, apiKey: string) =>
        request<{ status: string }>(`/nodes/${nodeId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, address, api_key: apiKey }),
        }),

    // 删除节点
    delete: (nodeId: string) =>
        request<{ status: string }>(`/nodes/${nodeId}`, {
            method: 'DELETE',
        }),

    // 获取集群配置
    getClusterConfig: () => request<ClusterConfig>('/cluster/config'),

    // 保存集群配置
    saveClusterConfig: (config: Partial<ClusterConfig>) =>
        request<{ status: string }>('/cluster/config', {
            method: 'POST',
            body: JSON.stringify(config),
        }),

    // 获取节点程序日志
    getLogs: (nodeId: string = 'local', lines: number = 500) =>
        request<{ status: string; logs: string }>(`/node/logs?node_id=${nodeId}&lines=${lines}`),

    // 获取主机监控数据
    getMonitor: () =>
        request<{
            status: string; cpu: number[]; mem: number[];
            current_cpu: number; current_mem: number;
            instances: { total: number; running: number };
        }>('/node/monitor'),
};

// ============ 用户相关 API ============

export const userApi = {
    // 获取用户列表
    list: (page: number = 1, pageSize: number = 20, search: string = '') =>
        request<{ status: string; data: User[] }>(`/users?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`),

    // 创建用户
    create: (username: string, password: string, permission: number = 1) =>
        request<{ status: string; uuid: string; userName: string }>('/users', {
            method: 'POST',
            body: JSON.stringify({ username, password, permission }),
        }),

    // 编辑用户
    edit: (uuid: string, data: UserEditPayload) =>
        request<{ status: string }>(`/users/${uuid}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    // 删除用户
    delete: (uuid: string) =>
        request<{ status: string }>(`/users/${uuid}`, {
            method: 'DELETE',
        }),

    // 分配实例
    assignInstances: (uuid: string, instances: InstanceRef[]) =>
        request<{ status: string }>(`/users/${uuid}/instances`, {
            method: 'PUT',
            body: JSON.stringify({ instances }),
        }),

    // 重新生成 API Key
    regenerateApiKey: (uuid: string) =>
        request<{ status: string; apiKey: string }>(`/users/${uuid}/apikey`, {
            method: 'PUT',
        }),
};

// ============ 操作日志 API ============

export const operationLogsApi = {
    list: (limit: number = 50) =>
        request<{ status: string; logs: OperationLog[] }>(`/operation_logs?limit=${limit}`),
};

// ============ 镜像管理 API ============

export const imageApi = {
    list: () => request<{ status: string; images: DockerImage[] }>('/images'),

    pull: (image: string) =>
        request<{ status: string }>('/images/pull', {
            method: 'POST',
            body: JSON.stringify({ image }),
        }),

    delete: (imageId: string, force: boolean = false) =>
        request<{ status: string }>(`/images/${imageId}?force=${force}`, {
            method: 'DELETE',
        }),
};

// ============ 告警管理 API ============

export const alertApi = {
    listRules: () =>
        request<{ status: string; rules: AlertRule[] }>('/alerts/rules'),

    createRule: (data: { name: string; type: string; config: Record<string, unknown>; webhook_url: string }) =>
        request<{ status: string; rule_id: string }>('/alerts/rules', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateRule: (ruleId: string, data: Partial<{ name: string; enabled: boolean; config: Record<string, unknown>; webhook_url: string }>) =>
        request<{ status: string }>(`/alerts/rules/${ruleId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deleteRule: (ruleId: string) =>
        request<{ status: string }>(`/alerts/rules/${ruleId}`, { method: 'DELETE' }),

    getHistory: (limit: number = 50) =>
        request<{ status: string; history: AlertHistory[] }>(`/alerts/history?limit=${limit}`),

    getSettings: () =>
        request<{ status: string; allow_local_webhook: boolean }>('/alerts/settings'),

    updateSettings: (data: { allow_local_webhook: boolean }) =>
        request<{ status: string }>('/alerts/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
};

// ============ 备份管理 API ============

export const backupApi = {
    getInfo: () =>
        request<{ status: string; info: { exists: boolean; size: number; modified: string; path: string } }>('/backup/info'),

    download: () => {
        window.open('/api/backup/download', '_blank');
    },

    upload: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await fetch(`${API_BASE}/backup/upload`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData,
        });
        if (!resp.ok) throw new Error('Upload failed');
        return resp.json() as Promise<{ status: string; message: string }>;
    },
};

// ============ 定时任务 API ============

export interface ScheduledTask {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    interval_seconds: number;
    config: Record<string, unknown>;
    last_run: number;
    created_at: number;
}

export const schedulerApi = {
    list: () =>
        request<{ status: string; tasks: ScheduledTask[] }>('/scheduler/tasks'),

    create: (data: { name: string; type: string; interval_seconds: number; config?: Record<string, unknown> }) =>
        request<{ status: string; task_id: string }>('/scheduler/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (taskId: string, data: Partial<{ name: string; enabled: boolean; interval_seconds: number; config: Record<string, unknown> }>) =>
        request<{ status: string }>(`/scheduler/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    delete: (taskId: string) =>
        request<{ status: string }>(`/scheduler/tasks/${taskId}`, { method: 'DELETE' }),
};

// ============ 认证相关 API ============

export const authApi = {
    // 登录
    login: (username: string, password: string) =>
        request<{ status: string; message?: string; user: AuthUser }>('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }),

    // 登出
    logout: () =>
        request<{ status: string }>('/logout', {
            method: 'POST',
        }),

    // 获取认证状态
    getStatus: () => request<{ status: string; user: AuthUser }>('/auth/status'),
};

// ============ 首次初始化 API ============

export interface SetupStatus {
    status: string;
    initialized: boolean;
    local_ip: string;
    default_data_dir: string;
    default_port: number;
}

export interface SetupRequest {
    admin_username: string;
    admin_password: string;
    host: string;
    port: number;
    data_dir?: string;
}

export const setupApi = {
    // 获取初始化状态（不需要认证）
    getStatus: () =>
        fetch(`${API_BASE}/setup/status`, { credentials: 'include' })
            .then(r => r.json()) as Promise<SetupStatus>,

    // 执行首次初始化（不需要认证）
    init: (data: SetupRequest) =>
        fetch(`${API_BASE}/setup/init`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(data),
        }).then(async r => {
            const json = await r.json();
            if (!r.ok) throw new Error(json.message || 'Setup failed');
            return json as { status: string; message: string; user: AuthUser };
        }),
};
