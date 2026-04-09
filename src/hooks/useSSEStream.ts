import {useState, useEffect, useCallback, useRef} from 'react';
import type {StreamStatus, StreamError} from '../types';

export interface SSEStreamOptions<T> {
    url: string;
    eventName: string;
    enabled?: boolean;
    onData?: (data: T) => void;
    onError?: (error: Error) => void;
    parseData?: (raw: string) => T;
    reconnectMaxDelay?: number;
    streamLabel?: string;
}

export interface SSEStreamResult {
    status: StreamStatus;
    isConnected: boolean;
    error: StreamError | null;
    lastMessageAt: number | null;
    reconnectCount: number;
    reconnect: () => void;
}

/**
 * All specific SSE hooks in this package delegate to this hook — they only
 * supply URL construction, event name, and data parsing logic.
 *
 * @example
 * ```ts
 * const { isConnected, error } = useSSEStream<TelemetryValue[]>({
 *   url: 'https://api.example.com/telemetry/stream?vesselId=v-001',
 *   eventName: 'telemetry',
 *   enabled: true,
 *   onData: (data) => setTelemetry(data),
 * });
 * ```
 */
export function useSSEStream<T>(options: SSEStreamOptions<T>): SSEStreamResult {
    const {
        url,
        eventName,
        enabled = true,
        reconnectMaxDelay = 30_000,
        streamLabel = 'SSE',
    } = options;

    const [status, setStatus] = useState<StreamStatus>('idle');
    const [streamError, setStreamError] = useState<StreamError | null>(null);
    const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
    const [reconnectCount, setReconnectCount] = useState(0);

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const onDataRef = useRef(options.onData);
    onDataRef.current = options.onData;
    const onErrorRef = useRef(options.onError);
    onErrorRef.current = options.onError;
    const parseDataRef = useRef(options.parseData);
    parseDataRef.current = options.parseData;

    const connect = useCallback(() => {
        if (typeof EventSource === 'undefined') {
            setStatus('disabled');
            setStreamError({
                code: 'UNSUPPORTED_ENVIRONMENT',
                message: 'EventSource is not supported in this environment',
                retryable: false,
            });
            return;
        }

        if (!enabled || !url) {
            setStatus('disabled');
            setStreamError(null);
            setLastMessageAt(null);
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            return;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        setStatus('connecting');
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setStatus('connected');
            setStreamError(null);
            reconnectAttemptsRef.current = 0;
        };

        eventSource.addEventListener(eventName, (event: MessageEvent) => {
            setLastMessageAt(Date.now());
            try {
                const parsed: T = parseDataRef.current
                    ? parseDataRef.current(event.data)
                    : (JSON.parse(event.data) as T);
                onDataRef.current?.(parsed);
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to parse SSE payload';
                setStreamError({
                    code: 'PAYLOAD_INVALID',
                    message: msg,
                    cause: err,
                    retryable: true,
                });
            }
        });

        eventSource.onerror = () => {
            setStatus('reconnecting');
            const sseErr: StreamError = {
                code: 'CONNECTION_FAILED',
                message: `${streamLabel} stream connection error`,
                retryable: true,
            };
            setStreamError(sseErr);
            onErrorRef.current?.(new Error(sseErr.message));
            eventSource.close();

            reconnectAttemptsRef.current += 1;
            setReconnectCount((c) => c + 1);
            const delay = Math.min(
                1000 * Math.pow(2, reconnectAttemptsRef.current),
                reconnectMaxDelay,
            );

            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
                if (enabled) connect();
            }, delay);
        };
    }, [url, eventName, enabled, reconnectMaxDelay, streamLabel]);

    useEffect(() => {
        connect();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    const reconnect = useCallback(() => {
        reconnectAttemptsRef.current = 0;
        setReconnectCount(0);
        connect();
    }, [connect]);

    return {
        status,
        isConnected: status === 'connected',
        error: streamError,
        lastMessageAt,
        reconnectCount,
        reconnect,
    };
}
