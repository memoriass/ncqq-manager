export interface EndpointEntry {
    url: string;
    alias: string;
    online: boolean | null;
    latency_ms: number | null;
    probing: boolean;
    note?: string;
    token: string;
}
