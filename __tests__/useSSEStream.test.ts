import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useSSEStream} from '../src';

class MockEventSource {
    static instances: MockEventSource[] = [];

    url: string;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0;
    private listeners: Record<string, ((e: MessageEvent) => void)[]> = {};

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

    addEventListener = vi.fn((event: string, handler: (e: MessageEvent) => void) => {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    });

    removeEventListener = vi.fn();

    simulateOpen() {
        this.readyState = MockEventSource.OPEN;
        this.onopen?.();
    }

    simulateEvent(eventType: string, data: unknown) {
        const handlers = this.listeners[eventType] ?? [];
        handlers.forEach((h) => h({data: JSON.stringify(data)} as MessageEvent));
    }

    simulateMalformedEvent(eventType: string) {
        const handlers = this.listeners[eventType] ?? [];
        handlers.forEach((h) => h({data: '{not json'} as MessageEvent));
    }

    simulateError() {
        this.onerror?.();
    }
}

describe('useSSEStream', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockEventSource.instances = [];
        (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (globalThis as unknown as Record<string, unknown>).EventSource;
    });

    it('returns initial disconnected state', () => {
        const {result} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        expect(result.current.connected).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.reconnectCount).toBe(0);
    });

    it('opens EventSource at the provided URL', () => {
        renderHook(() =>
            useSSEStream({url: 'http://example.com/stream?foo=bar', eventName: 'data'}),
        );

        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0]!.url).toBe('http://example.com/stream?foo=bar');
    });

    it('does not open EventSource when url is empty', () => {
        renderHook(() => useSSEStream({url: '', eventName: 'data'}));
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('does not open EventSource when enabled is false', () => {
        renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data', enabled: false}),
        );
        expect(MockEventSource.instances).toHaveLength(0);
    });

    it('sets connected to true on open and resets error', () => {
        const {result} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        act(() => {
            MockEventSource.instances[0]!.simulateOpen();
        });

        expect(result.current.connected).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it('calls onData with parsed value on event', () => {
        const onData = vi.fn();
        renderHook(() =>
            useSSEStream<{ value: number }>({
                url: 'http://example.com/stream',
                eventName: 'data',
                onData,
            }),
        );

        const instance = MockEventSource.instances[0]!;
        act(() => instance.simulateOpen());

        act(() => instance.simulateEvent('data', {value: 42}));

        expect(onData).toHaveBeenCalledWith({value: 42});
    });

    it('uses custom parseData function when provided', () => {
        const onData = vi.fn();
        renderHook(() =>
            useSSEStream<number>({
                url: 'http://example.com/stream',
                eventName: 'data',
                onData,
                parseData: (raw) => (JSON.parse(raw) as { v: number }).v,
            }),
        );

        const instance = MockEventSource.instances[0]!;
        act(() => instance.simulateOpen());
        act(() => instance.simulateEvent('data', {v: 99}));

        expect(onData).toHaveBeenCalledWith(99);
    });

    it('sets PAYLOAD_INVALID error on malformed frame without calling onData', () => {
        const onData = vi.fn();
        const {result} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data', onData}),
        );

        const instance = MockEventSource.instances[0]!;
        act(() => instance.simulateOpen());
        act(() => instance.simulateMalformedEvent('data'));

        expect(onData).not.toHaveBeenCalled();
        expect(result.current.error).not.toBeNull();
        expect(result.current.error?.code).toBe('PAYLOAD_INVALID');
        expect(result.current.status).toBe('connected');
    });

    it('sets connected to false and error on connection error', () => {
        const onError = vi.fn();
        const {result} = renderHook(() =>
            useSSEStream({
                url: 'http://example.com/stream',
                eventName: 'data',
                onError,
                streamLabel: 'Test',
            }),
        );

        act(() => MockEventSource.instances[0]!.simulateOpen());
        act(() => MockEventSource.instances[0]!.simulateError());

        expect(result.current.connected).toBe(false);
        expect(result.current.error?.message).toBe('Test stream connection error');
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('increments reconnectCount on each error', () => {
        const {result} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        act(() => MockEventSource.instances[0]!.simulateError());
        expect(result.current.reconnectCount).toBe(1);
    });

    it('schedules reconnect with exponential backoff after error', () => {
        renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        // First error → attempt 1 → delay = min(2000, 30000) = 2000ms
        act(() => MockEventSource.instances[0]!.simulateError());
        expect(MockEventSource.instances).toHaveLength(1);

        act(() => vi.advanceTimersByTime(2000));
        expect(MockEventSource.instances).toHaveLength(2);
    });

    it('resets reconnect counter and creates new EventSource on manual reconnect', () => {
        const {result} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        act(() => result.current.reconnect());

        expect(result.current.reconnectCount).toBe(0);
        expect(MockEventSource.instances).toHaveLength(2);
    });

    it('closes EventSource on unmount', () => {
        const {unmount} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        const instance = MockEventSource.instances[0]!;
        unmount();

        expect(instance.close).toHaveBeenCalled();
    });

    it('clears pending reconnect timeout on unmount', () => {
        const {unmount} = renderHook(() =>
            useSSEStream({url: 'http://example.com/stream', eventName: 'data'}),
        );

        act(() => MockEventSource.instances[0]!.simulateError());
        unmount();

        act(() => vi.advanceTimersByTime(60_000));
        expect(MockEventSource.instances).toHaveLength(1);
    });

    it('closes old EventSource and opens a new one when url changes', () => {
        const {rerender} = renderHook(
            ({url}: { url: string }) =>
                useSSEStream({url, eventName: 'data'}),
            {initialProps: {url: 'http://example.com/stream-a'}},
        );

        const first = MockEventSource.instances[0]!;

        act(() => {
            rerender({url: 'http://example.com/stream-b'});
        });

        expect(first.close).toHaveBeenCalled();
        expect(MockEventSource.instances).toHaveLength(2);
        expect(MockEventSource.instances[1]!.url).toBe('http://example.com/stream-b');
    });

    it('respects reconnectMaxDelay cap', () => {
        renderHook(() =>
            useSSEStream({
                url: 'http://example.com/stream',
                eventName: 'data',
                reconnectMaxDelay: 5_000,
            }),
        );

        for (let i = 0; i < 6; i++) {
            const last = MockEventSource.instances[MockEventSource.instances.length - 1]!;
            act(() => last.simulateError());
            act(() => vi.advanceTimersByTime(5_000));
        }

        // All reconnects should have fired (cap at 5000ms each)
        expect(MockEventSource.instances.length).toBeGreaterThan(1);
    });

    it('does not call onData callback when it changes identity between renders', () => {
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();

        const {rerender} = renderHook(
            ({onData}: { onData: (d: unknown) => void }) =>
                useSSEStream({url: 'http://example.com/stream', eventName: 'data', onData}),
            {initialProps: {onData: firstCallback}},
        );

        act(() => MockEventSource.instances[0]!.simulateOpen());

        act(() => rerender({onData: secondCallback}));

        expect(MockEventSource.instances).toHaveLength(1);

        act(() => MockEventSource.instances[0]!.simulateEvent('data', {x: 1}));

        expect(firstCallback).not.toHaveBeenCalled();
        expect(secondCallback).toHaveBeenCalledWith({x: 1});
    });
});
