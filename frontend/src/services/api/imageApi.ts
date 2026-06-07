import { API_BASE, request } from './client';
import type { DockerImage } from './types';

export const imageApi = {
    list: () => request<{ status: string; images: DockerImage[] }>('/images'),

    pull: (image: string) =>
        request<{ status: string }>('/images/pull', {
            method: 'POST',
            body: JSON.stringify({ image }),
        }),

    pullStream: (image: string) =>
        fetch(`${API_BASE}/images/pull/stream`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ image }),
        }),

    delete: (imageId: string, force: boolean = false) =>
        request<{ status: string }>(`/images/${imageId}?force=${force}`, {
            method: 'DELETE',
        }),
};

// ============ 告警管理 API ============
