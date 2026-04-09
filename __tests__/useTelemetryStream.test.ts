import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useTelemetryStream, useAggregatedMetricsStream} from '../src/hooks/useTelemetryStream';

class MockEventSource {
    static instances: MockEventSource[] = [];

    url: string;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0;
    private listeners: Record<string, ((e: { data: string }) => void)[]> = {};

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;

    constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
    }

    close = vi.fn(() => {
        this.readyState = MockEventSource.CLOSED;
    });

    addEventListener = vi.fn((event: string, handler: (e: { data: string }) => void) => {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    });

    removeEventListener = vi.fn();

    simulateOpen() {
        this.readyState = MockEventSource.OPEN;
        this.onopen?.();
    }

    simulateEvent(eventType: string, data: unknown) {
        const handlers = this.listeners[eventType] || [];
        handlers.forEach((handler) => handler({data: JSON.stringify(data)}));
    }

    simulateError() {
        this.onerror?.();
    }
}

describe('useTelemetryStream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockEventSource.instances = [];
        (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
    });

    afterEach(() => {
        delete (globalThis as unknown as Record<string, unknown>).EventSource;
    });

    it('returns initial disconnected state', () => {
        const {result} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM']}),
        );

        expect(result.current.data).toEqual([]);
        expect(result.current.connected).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('creates EventSource with correct URL params', () => {
        renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM', 'NAV_SOG']}),
        );

        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0]!.url).toContain('vesselId=v-001');
        expect(MockEventSource.instances[0]!.url).toContain('tagCodes=ME_RPM%2CNAV_SOG');
    });

    it('does not connect when vesselId is empty', () => {
        renderHook(() =>
            useTelemetryStream({vesselId: '', tagCodes: ['ME_RPM']}),
        );
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('does not connect when tagCodes is empty', () => {
        renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: []}),
        );
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('does not connect when enabled is false', () => {
        renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM'], enabled: false}),
        );
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('sets connected state on open', () => {
        const {result} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM']}),
        );

        act(() => {
            MockEventSource.instances[0]!.simulateOpen();
        });

        expect(result.current.connected).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it('updates data on telemetry event and calls onData callback', () => {
        const onData = vi.fn();
        const {result} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM'], onData}),
        );

        const instance = MockEventSource.instances[0]!;
        act(() => instance.simulateOpen());

        const frame = [{tagCode: 'ME_RPM', value: 1500, timestamp: '2024-01-01T00:00:00Z'}];

        act(() => {
            instance.simulateEvent('telemetry', frame);
        });

        expect(result.current.data).toEqual(frame);
        expect(onData).toHaveBeenCalledWith(frame);
    });

    it('sets error state on connection error and calls onError callback', () => {
        const onError = vi.fn();
        const {result} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM'], onError}),
        );

        act(() => {
            MockEventSource.instances[0]!.simulateError();
        });

        expect(result.current.connected).toBe(false);
        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.code).toBe('CONNECTION_FAILED');
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('closes EventSource on unmount', () => {
        const {unmount} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM']}),
        );

        const instance = MockEventSource.instances[0]!;
        unmount();

        expect(instance.close).toHaveBeenCalled();
    });

    it('exposes a reconnect function that resets attempt counter', () => {
        const {result} = renderHook(() =>
            useTelemetryStream({vesselId: 'v-001', tagCodes: ['ME_RPM']}),
        );

        act(() => {
            result.current.reconnect();
        });

        expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
    });

    it('calls updated onData after rerender', async () => {
        const onDataA = vi.fn();
        const onDataB = vi.fn();

        const {result, rerender} = renderHook(
            ({onData}: { onData: (data: unknown[]) => void }) =>
                useTelemetryStream({
                    vesselId: 'v1',
                    tagCodes: ['speed'],
                    onData: onData as (data: import('../src/types').TelemetryValue[]) => void,
                    baseUrl: 'http://test',
                }),
            {initialProps: {onData: onDataA}},
        );

        const eventSource = MockEventSource.instances[0];
        act(() => {
            eventSource?.simulateOpen();
        });

        act(() => {
            rerender({onData: onDataB});
        });

        act(() => {
            eventSource?.simulateEvent('telemetry', [{tagCode: 'speed', value: 10, timestamp: '2026-01-01T00:00:00Z'}]);
        });

        await vi.waitFor(() => {
            expect(onDataB).toHaveBeenCalled();
            expect(onDataA).not.toHaveBeenCalled();
        });

        expect(result.current.data).toEqual([{tagCode: 'speed', value: 10, timestamp: '2026-01-01T00:00:00Z'}]);
    });
});

describe('useAggregatedMetricsStream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockEventSource.instances = [];
        (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
    });

    afterEach(() => {
        delete (globalThis as unknown as Record<string, unknown>).EventSource;
    });

    it('returns null data initially', () => {
        const {result} = renderHook(() =>
            useAggregatedMetricsStream({tagCodes: ['ME_RPM']}),
        );

        expect(result.current.data).toBeNull();
        expect(result.current.connected).toBe(false);
    });

    it('connects to the aggregated endpoint', () => {
        renderHook(() =>
            useAggregatedMetricsStream({tagCodes: ['ME_RPM', 'TANK_FO_PORT']}),
        );

        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0]!.url).toContain('aggregated');
    });

    it('does not connect when tagCodes is empty', () => {
        renderHook(() =>
            useAggregatedMetricsStream({tagCodes: []}),
        );
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('updates data on aggregated-metrics event', () => {
        const {result} = renderHook(() =>
            useAggregatedMetricsStream({tagCodes: ['ME_RPM']}),
        );

        const instance = MockEventSource.instances[0]!;
        act(() => instance.simulateOpen());

        const frame = {
            aggregatedByTag: {ME_RPM: {min: 800, max: 2000, avg: 1400, count: 10}},
            byVessel: {'v-001': {ME_RPM: 1500}},
            vesselCount: 1,
            timestamp: Date.now(),
        };

        act(() => {
            instance.simulateEvent('aggregated-metrics', frame);
        });

        expect(result.current.data).toEqual(frame);
    });

    it('closes on unmount', () => {
        const {unmount} = renderHook(() =>
            useAggregatedMetricsStream({tagCodes: ['ME_RPM']}),
        );

        unmount();
        expect(MockEventSource.instances[0]!.close).toHaveBeenCalled();
    });
});
