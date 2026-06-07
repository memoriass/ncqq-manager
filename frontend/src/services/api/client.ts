export const API_BASE = '/api';

// 认证错误类 — 供上层区分 401 和其他异常
export class AuthError extends Error {
    constructor(message: string = 'Unauthorized') {
        super(message);
        this.name = 'AuthError';
    }
}

// 通用请求封装
export async function request<T>(
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
