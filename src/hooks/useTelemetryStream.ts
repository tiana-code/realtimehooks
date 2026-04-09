import {useState, useCallback, useRef} from 'react';
import {useSSEStream} from './useSSEStream';
import {resolveBaseUrl} from './resolveBaseUrl';
import type {TelemetryValue, AggregatedMetrics, StreamError} from '../types';

interface UseTelemetryStreamOptions {
    vesselId: string;
    tagCodes: string[];
    intervalSeconds?: number;
    enabled?: boolean;
    onData?: (data: TelemetryValue[]) => void;
    onError?: (error: Error) => void;
    baseUrl?: string;
}

interface UseTelemetryStreamResult {
    data: TelemetryValue[];
    connected: boolean;
    error: StreamError | null;
    reconnect: () => void;
}

interface UseAggregatedMetricsStreamOptions {
    vesselIds?: string[];
    tagCodes: string[];
    intervalSeconds?: number;
    enabled?: boolean;
    onData?: (data: AggregatedMetrics) => void;
    baseUrl?: string;
}

interface UseAggregatedMetricsStreamResult {
    data: AggregatedMetrics | null;
    connected: boolean;
    error: StreamError | null;
    reconnect: () => void;
}

function buildTelemetryUrl(
    vesselId: string,
    tagCodes: string[],
    intervalSeconds: number,
    baseUrl?: string,
): string {
    if (!vesselId || tagCodes.length === 0) return '';
    const origin = resolveBaseUrl(baseUrl);
    const url = new URL('/api/v1/telemetry/stream', origin);
    url.searchParams.set('vesselId', vesselId);
    url.searchParams.set('tagCodes', tagCodes.join(','));
    url.searchParams.set('intervalSeconds', intervalSeconds.toString());
    return url.toString();
}

function buildAggregatedUrl(
    vesselIds: string[] | undefined,
    tagCodes: string[],
    intervalSeconds: number,
    baseUrl?: string,
): string {
    if (tagCodes.length === 0) return '';
    const origin = resolveBaseUrl(baseUrl);
    const url = new URL('/api/v1/telemetry/stream/aggregated', origin);
    if (vesselIds && vesselIds.length > 0) {
        url.searchParams.set('vesselIds', vesselIds.join(','));
    }
    url.searchParams.set('tagCodes', tagCodes.join(','));
    url.searchParams.set('intervalSeconds', intervalSeconds.toString());
    return url.toString();
}

/**
 * Subscribe to real-time telemetry updates via SSE for a single vessel
 *
 * Features:
 * - Exponential backoff reconnection (1s → 30s max)
 * - Stable callbacks via refs (no reconnect on callback identity change)
 * - Clean teardown on unmount or options change
 *
 * @example
 * ```tsx
 * const { data, connected, error } = useTelemetryStream({
 *   vesselId: 'vessel-001',
 *   tagCodes: ['ME_RPM', 'ME_LO_TEMP', 'TANK_FO_PORT'],
 *   intervalSeconds: 5,
 * });
 * ```
 */
export const useTelemetryStream = ({
                                       vesselId,
                                       tagCodes,
                                       intervalSeconds = 5,
                                       enabled = true,
                                       onData,
                                       onError,
                                       baseUrl,
                                   }: UseTelemetryStreamOptions): UseTelemetryStreamResult => {
    const [data, setData] = useState<TelemetryValue[]>([]);

    const onDataRef = useRef(onData);
    onDataRef.current = onData;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const url = buildTelemetryUrl(vesselId, tagCodes, intervalSeconds, baseUrl);

    const handleData = useCallback((parsed: TelemetryValue[]) => {
        setData(parsed);
        onDataRef.current?.(parsed);
    }, []);

    const handleError = useCallback((err: Error) => {
        onErrorRef.current?.(err);
    }, []);

    const {connected, error, reconnect} = useSSEStream<TelemetryValue[]>({
        url,
        eventName: 'telemetry',
        enabled: enabled && !!vesselId && tagCodes.length > 0,
        onData: handleData,
        onError: handleError,
        streamLabel: 'Telemetry',
    });

    return {data, connected, error, reconnect};
};

/**
 * Subscribe to aggregated fleet-wide telemetry metrics via SSE
 * Useful for dashboard widgets that aggregate across multiple vessels.
 *
 * @example
 * ```tsx
 * const { data, connected } = useAggregatedMetricsStream({
 *   tagCodes: ['ME_RPM', 'TANK_FO_PORT'],
 *   intervalSeconds: 30,
 * });
 * ```
 */
export const useAggregatedMetricsStream = ({
                                               vesselIds,
                                               tagCodes,
                                               intervalSeconds = 30,
                                               enabled = true,
                                               onData,
                                               baseUrl,
                                           }: UseAggregatedMetricsStreamOptions): UseAggregatedMetricsStreamResult => {
    const [data, setData] = useState<AggregatedMetrics | null>(null);

    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    const url = buildAggregatedUrl(vesselIds, tagCodes, intervalSeconds, baseUrl);

    const handleData = useCallback((parsed: AggregatedMetrics) => {
        setData(parsed);
        onDataRef.current?.(parsed);
    }, []);

    const {connected, error, reconnect} = useSSEStream<AggregatedMetrics>({
        url,
        eventName: 'aggregated-metrics',
        enabled: enabled && tagCodes.length > 0,
        onData: handleData,
        streamLabel: 'Aggregated metrics',
    });

    return {data, connected, error, reconnect};
};

export default useTelemetryStream;
