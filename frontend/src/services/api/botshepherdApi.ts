import { request } from './client';
import type { BackendEndpoint, BotShepherdStatus, BSAccount, BSAccountsResponse, BSConnection, BSConnectionsResponse } from './types';

export const botshepherdApi = {
    status: () => request<BotShepherdStatus>('/botshepherd/status'),
    setup: () => request<{ status: string; message: string }>('/botshepherd/setup', { method: 'POST' }),
    start: () => request<{ status: string; message: string }>('/botshepherd/start', { method: 'POST' }),
    stop: () => request<{ status: string; message: string }>('/botshepherd/stop', { method: 'POST' }),
    logs: (lines: number = 100) => request<{ status: string; logs: string[] }>(`/botshepherd/logs?lines=${lines}`),
    // 连接管理
    connections: () => request<BSConnectionsResponse>('/botshepherd/connections'),
    updateConnection: (id: string, data: Partial<BSConnection>) =>
        request<{ success: boolean }>(`/botshepherd/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    copyConnection: (id: string, newId: string, newName?: string) =>
        request<{ success: boolean; message?: string }>(`/botshepherd/connections/${id}/copy`, {
            method: 'POST', body: JSON.stringify({ new_id: newId, new_name: newName ?? '' }),
        }),
    deleteConnection: (id: string) =>
        request<{ success: boolean }>(`/botshepherd/connections/${id}`, { method: 'DELETE' }),
    // 账号管理
    accounts: () => request<BSAccountsResponse>('/botshepherd/accounts'),
    updateAccount: (id: string, data: Partial<BSAccount>) =>
        request<{ success: boolean }>(`/botshepherd/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteAccount: (id: string) =>
        request<{ success: boolean }>(`/botshepherd/accounts/${id}`, { method: 'DELETE' }),
    accountOnline: (id: string) =>
        request<{ online: boolean }>(`/botshepherd/accounts/${id}/online-status`),
    // Bot 框架端点探测
    botsHeartbeat: () =>
        request<{ status: string; bots: Record<string, unknown> }>('/botshepherd/bots/heartbeat'),
    probeTarget: (url: string, token?: string) =>
        request<{ online: boolean; latency_ms: number | null; note?: string; status_code?: number }>(
            '/botshepherd/probe-target',
            { method: 'POST', body: JSON.stringify({ url, token: token ?? '' }) },
        ),
    // Bot 后端端点库（持久化）
    backendEndpoints: () =>
        request<{ status: string; endpoints: BackendEndpoint[] }>('/botshepherd/radar/endpoints'),
    saveBackendEndpoints: (endpoints: BackendEndpoint[]) =>
        request<{ status: string; count: number }>(
            '/botshepherd/radar/endpoints',
            { method: 'POST', body: JSON.stringify({ endpoints }) },
        ),
    injectByAlias: (params: { alias: string; target: 'bs' | 'nc'; conn_id?: string; container_name?: string; uin?: string }) =>
        request<{ success: boolean; message?: string; error?: string }>(
            '/botshepherd/radar/inject-by-alias',
            { method: 'POST', body: JSON.stringify(params) },
        ),
    // 连接健康监控（生命周期跟随 BS，无需手动调用）
};

// ============ 网络配置注入 ============

/** 单个网络端点的完整字段（所有字段均可选，后端按需合并） */
