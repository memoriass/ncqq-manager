import { request } from './client';
import type { Container, ContainerStats, CreateContainerRequest, FileItem, FolderItem } from './types';

export const containerApi = {
    // 获取容器列表
    list: (nodeId?: string) =>
        request<{ status: string; containers: Container[] }>(
            nodeId ? `/containers?node_id=${nodeId}` : '/containers'
        ),

    // 获取容器统计信息
    getStats: (name: string, nodeId: string = 'local') =>
        request<ContainerStats>(`/containers/${name}/stats?node_id=${nodeId}`),

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
        request<{ status: string; url?: string; type?: string; uin?: string; generated_at?: number; expires_in?: number; expires_at?: number }>(`/containers/${name}/qrcode?node_id=${nodeId}`),

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

    // 删除文件或文件夹
    deleteFile: (name: string, path: string, nodeId: string = 'local') =>
        request<{ status: string }>(
            `/containers/${name}/files?path=${encodeURIComponent(path)}&node_id=${nodeId}`,
            { method: 'DELETE' }
        ),
};

// ============ 节点相关 API ============
