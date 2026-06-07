import { request } from './client';
import type { AuthUser } from './types';

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

