import { request } from './client';
import type { ClusterConfig, Node } from './types';

export const nodeApi = {
    // 获取节点列表（quick=true 跳过远程健康检查，首屏快速渲染）
    list: (quick?: boolean) => request<{ status: string; nodes: Node[] }>(quick ? '/nodes?quick=true' : '/nodes'),

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
