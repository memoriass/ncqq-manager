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

export function useWebSocket<T = unknown>(options: UseWSOptions) {
    const { path, reconnectInterval = 5000, enabled = true } = options;
    const [data, setData] = useState<T | null>(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();

    const getToken = useCallback(() => {
        const cookies = document.cookie.split(';');
        for (const c of cookies) {
            const [key, val] = c.trim().split('=');
            if (key === 'auth_token') return val;
        }
        return '';
    }, []);

    const connect = useCallback(() => {
        if (!enabled) return;
        const token = getToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}${path}?token=${token}`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
            setConnected(false);
            // 自动重连
            if (enabled) {
                timerRef.current = setTimeout(connect, reconnectInterval);
            }
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                setData(msg);
            } catch { /* ignore */ }
        };
    }, [path, enabled, reconnectInterval, getToken]);

    useEffect(() => {
        connect();
        return () => {
            clearTimeout(timerRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    const send = useCallback((msg: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    return { data, connected, send };
}

