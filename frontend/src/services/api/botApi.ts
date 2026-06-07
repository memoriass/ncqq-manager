import { request } from './client';
import type { BotMessage, BotStatusItem } from './types';

export const botApi = {
    /** 列出所有已知 Bot（含已断线历史），connected=true 表示当前在线 */
    list: () => request<BotStatusItem[]>('/bots'),

    /** 通用 OneBot API 代理调用 */
    call: (name: string, action: string, params: Record<string, unknown> = {}) =>
        request<{ status: string; data: unknown }>(`/bots/${name}/call`, {
            method: 'POST',
            body: JSON.stringify({ action, params }),
        }),

    /** 获取 Bot 最近缓存消息 */
    getMessages: (name: string, limit: number = 50) =>
        request<{ status: string; name: string; count: number; messages: BotMessage[] }>(
            `/bots/${name}/messages?limit=${limit}`
        ),

    /** 便捷发消息 */
    send: (name: string, msgType: string, targetId: string, message: string) =>
        request<{ status: string; message_id: number }>(`/bots/${name}/send`, {
            method: 'POST',
            body: JSON.stringify({ msg_type: msgType, target_id: targetId, message }),
        }),
};
