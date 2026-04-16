import {useState, useCallback, useRef} from 'react';
import {useSSEStream} from './useSSEStream';
import {resolveBaseUrl} from './resolveBaseUrl';
import type {Alert, AlertSummary, StreamError} from '../types';

interface UseAlertStreamOptions {
    vesselId?: string | undefined;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
    intervalSeconds?: number | undefined;
    enabled?: boolean | undefined;
    onAlert?: ((alerts: Alert[]) => void) | undefined;
    onError?: ((error: Error) => void) | undefined;
    baseUrl?: string | undefined;
}

interface UseAlertStreamResult {
    alerts: Alert[];
    isConnected: boolean;
    error: StreamError | null;
    reconnect: () => void;
}

interface UseAlertSummaryStreamOptions {
    intervalSeconds?: number | undefined;
    enabled?: boolean | undefined;
    baseUrl?: string | undefined;
}

interface UseAlertSummaryStreamResult {
    summary: AlertSummary | null;
    isConnected: boolean;
    error: StreamError | null;
    reconnect: () => void;
}

function buildAlertUrl(
    vesselId: string | undefined,
    severity: string | undefined,
    intervalSeconds: number,
    baseUrl?: string,
): string {
    const origin = resolveBaseUrl(baseUrl);
    if (!origin) return '';
    const url = new URL('/api/v1/alerts/stream', origin);
    if (vesselId) url.searchParams.set('vesselId', vesselId);
    if (severity) url.searchParams.set('severity', severity);
    url.searchParams.set('intervalSeconds', intervalSeconds.toString());
    return url.toString();
}

function buildAlertSummaryUrl(intervalSeconds: number, baseUrl?: string): string {
    const origin = resolveBaseUrl(baseUrl);
    if (!origin) return '';
    const url = new URL('/api/v1/alerts/stream/summary', origin);
    url.searchParams.set('intervalSeconds', intervalSeconds.toString());
    return url.toString();
}

export const useAlertStream = ({
                                   vesselId,
                                   severity,
                                   intervalSeconds = 5,
                                   enabled = true,
                                   onAlert,
                                   onError,
                                   baseUrl,
                               }: UseAlertStreamOptions): UseAlertStreamResult => {
    const [alerts, setAlerts] = useState<Alert[]>([]);

    const onAlertRef = useRef(onAlert);
    onAlertRef.current = onAlert;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const url = buildAlertUrl(vesselId, severity, intervalSeconds, baseUrl);

    const handleData = useCallback((parsed: Alert[]) => {
        setAlerts(parsed);
        onAlertRef.current?.(parsed);
    }, []);

    const handleError = useCallback((err: Error) => {
        onErrorRef.current?.(err);
    }, []);

    const {isConnected, error, reconnect} = useSSEStream<Alert[]>({
        url,
        eventName: 'alerts',
        enabled,
        onData: handleData,
        onError: handleError,
        streamLabel: 'Alert',
    });

    return {alerts, isConnected, error, reconnect};
};

export const useAlertSummaryStream = ({
                                          intervalSeconds = 30,
                                          enabled = true,
                                          baseUrl,
                                      }: UseAlertSummaryStreamOptions): UseAlertSummaryStreamResult => {
    const [summary, setSummary] = useState<AlertSummary | null>(null);

    const url = buildAlertSummaryUrl(intervalSeconds, baseUrl);

    const handleData = useCallback((parsed: AlertSummary) => {
        setSummary(parsed);
    }, []);

    const {isConnected, error, reconnect} = useSSEStream<AlertSummary>({
        url,
        eventName: 'alert-summary',
        enabled,
        onData: handleData,
        streamLabel: 'Alert summary',
    });

    return {summary, isConnected, error, reconnect};
};

export default useAlertStream;
