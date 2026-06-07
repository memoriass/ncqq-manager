import { API_BASE } from './client';
import type { AuthUser, SetupRequest, SetupStatus } from './types';

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

// ============ BotShepherd API ============
