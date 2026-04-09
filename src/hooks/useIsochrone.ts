import {useState, useCallback, useRef, useEffect} from 'react';
import type {IsochroneRequest, IsochroneResult} from '../types';

export interface UseIsochroneReturn {
    data: IsochroneResult | null;
    loading: boolean;
    error: Error | null;
    calculate: (request: IsochroneRequest) => Promise<void>;
    clear: () => void;
}

/**
 * Calculate isochrone weather routing contours and optimal route
 *
 * Calls a REST endpoint (POST /weather/isochrone) — not SSE
 * The `baseUrl` parameter lets you point at any compatible backend.
 * Automatically aborts in-flight requests when a new calculation is triggered
 * or the component unmounts.
 *
 * @example
 * ```tsx
 * const { data, loading, error, calculate, clear } = useIsochrone({
 *   baseUrl: 'https://ml-api.example.com',
 * });
 *
 * const handleCalculate = async () => {
 *   await calculate({
 *     vessel_id: 'my-vessel',
 *     origin: [52.20, 2.80],
 *     destination: [40.71, -74.00],
 *     departure_time: new Date(),
 *     base_speed_knots: 15,
 *   });
 * };
 * ```
 */
export function useIsochrone(options?: { baseUrl?: string }): UseIsochroneReturn {
    const [data, setData] = useState<IsochroneResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const baseUrl = options?.baseUrl ?? '';
    const url = `${baseUrl}/weather/isochrone`;

    const controllerRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    const calculate = useCallback(
        async (request: IsochroneRequest) => {
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            const currentId = ++requestIdRef.current;

            setLoading(true);
            setError(null);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        vessel_id: request.vessel_id,
                        origin: request.origin,
                        destination: request.destination,
                        departure_time: request.departure_time.toISOString(),
                        base_speed_knots: request.base_speed_knots,
                        forecast_window_hours: request.forecast_window_hours ?? 48,
                        time_step_hours: request.time_step_hours ?? 2.0,
                        bearing_step_degrees: request.bearing_step_degrees ?? 10,
                    }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result: IsochroneResult = await response.json();
                if (currentId === requestIdRef.current) {
                    setData(result);
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                if (currentId === requestIdRef.current) {
                    setError(err instanceof Error ? err : new Error('Isochrone calculation failed'));
                }
            } finally {
                if (currentId === requestIdRef.current) {
                    setLoading(false);
                }
            }
        },
        [url],
    );

    useEffect(() => {
        return () => {
            controllerRef.current?.abort();
        };
    }, []);

    const clear = useCallback(() => {
        setData(null);
        setError(null);
    }, []);

    return {data, loading, error, calculate, clear};
}

/**
 * Format route time delta (hours) relative to direct route
 * Positive hours = route is faster (shown as -Xh saving)
 * Negative hours = route is slower (shown as +Xh overhead)
 */
export function formatTimeSavings(hours: number | undefined): string {
    if (hours === undefined || hours === null) return 'N/A';
    const absHours = Math.abs(hours);
    const sign = hours >= 0 ? '-' : '+';
    if (absHours < 1) {
        return `${sign}${Math.round(absHours * 60)}min`;
    }
    return `${sign}${absHours.toFixed(1)}h`;
}

export function formatArrivalTime(isoString: string | undefined): string {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return 'N/A';
    }
}

export type WeatherSeverity = 'calm' | 'moderate' | 'rough' | 'severe';

export function getWeatherSeverity(maxWaveM: number, maxWindMs: number): WeatherSeverity {
    if (maxWaveM > 4 || maxWindMs > 15) return 'severe';
    if (maxWaveM > 2 || maxWindMs > 10) return 'rough';
    if (maxWaveM > 1 || maxWindMs > 5) return 'moderate';
    return 'calm';
}

export function getWeatherSeverityColor(severity: WeatherSeverity): string {
    switch (severity) {
        case 'calm':
            return '#00C853';
        case 'moderate':
            return '#FFD600';
        case 'rough':
            return '#FF9100';
        case 'severe':
            return '#FF1744';
        default:
            return '#9E9E9E';
    }
}

export default useIsochrone;
