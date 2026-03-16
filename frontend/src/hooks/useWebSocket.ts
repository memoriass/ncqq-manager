/**
 * WebSocket Hook - 实时事件连接
 * 提供自动重连、心跳检测和状态管理
 */
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWSOptions {
    /** WebSocket URL path (e.g. /ws/events) */
    path: string;
    /** 自动重连间隔 (ms) */
    reconnectInterval?: number;
    /** 是否自动连接 */
    enabled?: boolean;
}

const HEARTBEAT_TIMEOUT = 25000; // 25s 无消息则判定断线（后端容器多时推送间隔可达 5s）

export function useWebSocket<T = unknown>(options: UseWSOptions) {
    const { path, reconnectInterval = 5000, enabled = true } = options;
    const [data, setData] = useState<T | null>(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();
    const heartbeatRef = useRef<ReturnType<typeof setTimeout>>();
    // 标记组件是否已卸载 / effect 是否已 cleanup，防止 onclose 回调触发多余重连
    const disposedRef = useRef(false);

    // 稳定引用：把 path / enabled / reconnectInterval 存到 ref，避免 connect 依赖变化导致 useEffect 重跑
    const optRef = useRef({ path, enabled, reconnectInterval });
    optRef.current = { path, enabled, reconnectInterval };

    const connect = useCallback(() => {
        const { path: p, enabled: en, reconnectInterval: ri } = optRef.current;
        if (!en || disposedRef.current) return;

        // 先关旧连接，防止重复
        if (wsRef.current) {
            try { wsRef.current.close(); } catch { /* ignore */ }
            wsRef.current = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}${p}`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        const resetHB = () => {
            clearTimeout(heartbeatRef.current);
            heartbeatRef.current = setTimeout(() => {
                // 超时无消息，主动断开触发重连
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
            // 仅在未 dispose 时自动重连
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
                setData(msg);
            } catch { /* ignore */ }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // path / enabled 变化时重连
    useEffect(() => {
        // optRef 已自动更新；只需断开旧连接触发 onclose → 重连
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, enabled]);

    const send = useCallback((msg: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    return { data, connected, send };
}

