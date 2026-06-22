import { request } from './client';
import type { InstanceRef, User, UserEditPayload } from './types';

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
    regenerateApiKey: async (uuid: string) => {
        const result = await request<{ status: string; apiKey?: string; api_key?: string }>(`/users/${uuid}/apikey`, {
            method: 'PUT',
        });
        const apiKey = result.apiKey ?? result.api_key;
        if (!apiKey) {
            throw new Error('API key missing in response');
        }
        return { status: result.status, apiKey };
    },
};

// ============ 操作日志 API ============

// ============ 镜像管理 API ============
