import { API_BASE } from './client';
import type { Container } from './types';

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
    getQR: async (name: string, nodeId: string = 'local'): Promise<{ status: string; url?: string; type?: string; uin?: string; generated_at?: number; expires_in?: number; expires_at?: number }> => {
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
