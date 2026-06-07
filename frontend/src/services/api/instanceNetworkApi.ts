import { request } from './client';
import type { InjectNetworkConfigRequest } from './types';

export const instanceNetworkApi = {
    injectNetworkConfig: (containerName: string, req: InjectNetworkConfigRequest) =>
        request<{ status: string; message: string; keys_updated: string[] }>(
            `/containers/${containerName}/inject-network-config`,
            { method: 'POST', body: JSON.stringify(req) },
        ),
};

// ============ Bot 在线状态 API ============
