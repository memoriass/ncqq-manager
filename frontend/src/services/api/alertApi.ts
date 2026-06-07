import { request } from './client';
import type { AlertHistory, AlertRule, AlertSettings } from './types';

export const alertApi = {
    listRules: () =>
        request<{ status: string; rules: AlertRule[] }>('/alerts/rules'),

    createRule: (data: { name: string; type: string; config: Record<string, unknown>; webhook_url: string }) =>
        request<{ status: string; rule_id: string }>('/alerts/rules', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateRule: (ruleId: string, data: Partial<{ name: string; enabled: boolean; config: Record<string, unknown>; webhook_url: string }>) =>
        request<{ status: string }>(`/alerts/rules/${ruleId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deleteRule: (ruleId: string) =>
        request<{ status: string }>(`/alerts/rules/${ruleId}`, { method: 'DELETE' }),

    getHistory: (limit: number = 50) =>
        request<{ status: string; history: AlertHistory[] }>(`/alerts/history?limit=${limit}`),

    getSettings: () =>
        request<AlertSettings>('/alerts/settings'),

    updateSettings: (data: Partial<Omit<AlertSettings, 'status' | 'smtp_password_set'>> & { smtp_password?: string }) =>
        request<{ status: string }>('/alerts/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    testSmtp: (data: { recipients: string; subject?: string; message?: string }) =>
        request<{ status: string; message?: string }>('/alerts/smtp/test', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

// ============ 备份管理 API ============
