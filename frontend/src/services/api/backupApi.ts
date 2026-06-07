import { API_BASE, request } from './client';

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

// ============ 认证相关 API ============
