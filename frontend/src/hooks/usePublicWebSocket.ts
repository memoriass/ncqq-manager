/**
 * 公开 WebSocket Hook — 用户面板专用
 *
 * 连接 /ws/public，接收容器列表 + QR 状态推送。
 * 替代 UserDashboard 中的 HTTP 轮询（fetchContainers + loadBatchQR）。
 *
 * 协议：
 *   服务端 → 客户端:
 *     {"type": "full",      "data": {"containers": [...], "qr": {...}}}
 *     {"type": "heartbeat"}
 *   客户端 → 服务端:
 *     {"type": "subscribe", "page": 1, "pageSize": 20}
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Container } from '../services/api';

interface QRItem {
    status: string;
    url?: string;
    type?: string;
    uin?: string;
}

interface PublicWSData {
    containers: Container[];
    qr: Record<string, QRItem>;
}

interface UsePublicWSOptions {
    /** 是否启用 WS 连接 */
    enabled?: boolean;
    /** 自动重连间隔 (ms) */
    reconnectInterval?: number;
}

const HEARTBEAT_TIMEOUT = 25000;

export function usePublicWebSocket(options: UsePublicWSOptions = {}) {
    const { enabled = true, reconnectInterval = 5000 } = options;
    const [containers, setContainers] = useState<Container[]>([]);
    const [qrStates, setQrStates] = useState<Record<string, QRItem>>({});
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();
    const heartbeatRef = useRef<ReturnType<typeof setTimeout>>();
    const disposedRef = useRef(false);
    const optRef = useRef({ enabled, reconnectInterval });
    optRef.current = { enabled, reconnectInterval };

    const connect = useCallback(() => {
        const { enabled: en, reconnectInterval: ri } = optRef.current;
        if (!en || disposedRef.current) return;

        if (wsRef.current) {
            try { wsRef.current.close(); } catch { /* ignore */ }
            wsRef.current = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws/public`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        const resetHB = () => {
            clearTimeout(heartbeatRef.current);
            heartbeatRef.current = setTimeout(() => {
                wsRef.current?.close();
            }, HEARTBEAT_TIMEOUT);
        };

        ws.onopen = () => {
            if (disposedRef.current) { ws.close(); return; }
            setConnected(true);
            resetHB();
        };
        ws.onclose = () => {
            setConnected(false);
            clearTimeout(heartbeatRef.current);
            if (!disposedRef.current && en) {
                timerRef.current = setTimeout(connect, ri);
            }
        };
        ws.onerror = () => {
            try { ws.close(); } catch { /* ignore */ }
        };
        ws.onmessage = (event) => {
            resetHB();
            try {
                const msg = JSON.parse(event.data);
                if (msg?.type === 'heartbeat') return;
                if (msg?.type === 'full' && msg.data) {
                    const d = msg.data as PublicWSData;
                    // 全量模式: containers 是数组
                    if (Array.isArray(d.containers)) {
                        setContainers(d.containers);
                    }
                    // 分页模式: containers 是 {page, data: [...], ...}
                    else if (d.containers && Array.isArray((d.containers as Record<string, unknown>).data)) {
                        setContainers((d.containers as Record<string, unknown>).data as Container[]);
                    }
                    if (d.qr) {
                        setQrStates(d.qr);
                    }
                }
            } catch { /* ignore */ }
        };
    }, []);

    useEffect(() => {
        disposedRef.current = false;
        connect();
        return () => {
            disposedRef.current = true;
            clearTimeout(timerRef.current);
            clearTimeout(heartbeatRef.current);
            if (wsRef.current) {
                try { wsRef.current.close(); } catch { /* ignore */ }
                wsRef.current = null;
            }
        };
    }, [connect]);

    // enabled 变化时重连
    useEffect(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    const send = useCallback((msg: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    return { containers, qrStates, connected, send };
}

