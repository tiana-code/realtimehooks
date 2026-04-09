import {describe, it, expect, beforeEach} from 'vitest';
import {
    computeGapIndices,
    getTimestampMs,
    haversineKm,
    useMapDataStore,
    useMapPreferencesStore,
    MAX_TRAIL_POINTS,
    ACTUAL_GAP_THRESHOLD_KM,
} from '../src';
import type {RoutePoint} from '../src';

const makePoint = (timestamp: string, lat = 55.0, lon = 20.0, extras?: Partial<Omit<RoutePoint, 'timestampMs'>>): RoutePoint => ({
    latitude: lat,
    longitude: lon,
    timestamp,
    ...extras,
});

describe('getTimestampMs', () => {
    it('parses a valid ISO timestamp and returns epoch ms', () => {
        const point = makePoint('2024-06-15T12:30:00Z');
        expect(getTimestampMs(point)).toBe(Date.parse('2024-06-15T12:30:00Z'));
    });

    it('caches result — returns same value on subsequent calls', () => {
        const point = makePoint('2024-06-15T12:30:00Z');
        const firstCall = getTimestampMs(point);
        const secondCall = getTimestampMs(point);
        expect(firstCall).toBe(secondCall);
    });

    it('caches result in WeakMap — returns same value on subsequent calls without mutation', () => {
        const point = makePoint('2024-06-15T12:30:00Z');
        const expected = Date.parse('2024-06-15T12:30:00Z');
        expect(getTimestampMs(point)).toBe(expected);
        expect(getTimestampMs(point)).toBe(expected);
        expect(Object.prototype.hasOwnProperty.call(point, 'timestampMs')).toBe(false);
    });

    it('returns 0 for invalid timestamp', () => {
        expect(getTimestampMs(makePoint('not-a-date'))).toBe(0);
    });

    it('returns 0 for empty string', () => {
        expect(getTimestampMs(makePoint(''))).toBe(0);
    });

    it('does not cache 0 — re-parses when timestamp is later fixed', () => {
        const point = makePoint('bad');
        expect(getTimestampMs(point)).toBe(0);
        (point as unknown as Record<string, unknown>).timestamp = '2024-06-15T12:30:00Z';
        expect(getTimestampMs(point)).toBe(Date.parse('2024-06-15T12:30:00Z'));
    });

    it('arithmetic between valid timestamps is finite', () => {
        const p1 = makePoint('2024-06-15T12:00:00Z');
        const p2 = makePoint('2024-06-15T12:30:00Z');
        const diff = getTimestampMs(p2) - getTimestampMs(p1);
        expect(Number.isFinite(diff)).toBe(true);
        expect(diff).toBe(30 * 60 * 1000);
    });

    it('comparison with 0 for filter pattern works correctly', () => {
        expect(getTimestampMs(makePoint('garbage')) > 0).toBe(false);
        expect(getTimestampMs(makePoint('2024-06-15T12:00:00Z')) > 0).toBe(true);
    });

    it('sort by timestamp produces correct order', () => {
        const points = [
            makePoint('2024-06-15T12:30:00Z'),
            makePoint('2024-06-15T12:00:00Z'),
            makePoint('2024-06-15T12:15:00Z'),
        ];
        const sorted = [...points].sort((a, b) => getTimestampMs(a) - getTimestampMs(b));
        expect(getTimestampMs(sorted[0]!)).toBeLessThan(getTimestampMs(sorted[1]!));
        expect(getTimestampMs(sorted[1]!)).toBeLessThan(getTimestampMs(sorted[2]!));
    });

    it('interpolation ratio with valid timestamps produces 0.5 at midpoint', () => {
        const p1 = makePoint('2024-06-15T12:00:00Z');
        const p2 = makePoint('2024-06-15T12:30:00Z');
        const target = Date.parse('2024-06-15T12:15:00Z');
        const t1 = getTimestampMs(p1);
        const t2 = getTimestampMs(p2);
        const ratio = t2 === t1 ? 0 : (target - t1) / (t2 - t1);
        expect(ratio).toBeCloseTo(0.5, 5);
    });
});

describe('haversineKm', () => {
    it('returns 0 for identical coordinates', () => {
        expect(haversineKm(55.0, 20.0, 55.0, 20.0)).toBe(0);
    });

    it('calculates known distance accurately', () => {
        // Approx distance from London (51.5, -0.12) to Paris (48.85, 2.35) ≈ 340 km
        const dist = haversineKm(51.5, -0.12, 48.85, 2.35);
        expect(dist).toBeGreaterThan(330);
        expect(dist).toBeLessThan(350);
    });

    it('is symmetric', () => {
        const forward = haversineKm(55.0, 20.0, 60.0, 25.0);
        const reverse = haversineKm(60.0, 25.0, 55.0, 20.0);
        expect(Math.abs(forward - reverse)).toBeLessThan(0.001);
    });
});

describe('computeGapIndices', () => {
    it('returns empty array for a single point', () => {
        const points = [{latitude: 55, longitude: 20}];
        expect(computeGapIndices(points)).toEqual([]);
    });

    it('returns empty array when all points are within threshold', () => {
        const points = [
            {latitude: 55.0, longitude: 20.0},
            {latitude: 55.1, longitude: 20.1},
            {latitude: 55.2, longitude: 20.2},
        ];
        expect(computeGapIndices(points, 100)).toEqual([]);
    });

    it('detects a gap between distant points', () => {
        const points = [
            {latitude: 55.0, longitude: 20.0},
            {latitude: 55.1, longitude: 20.1},
            {latitude: 10.0, longitude: -60.0}, // large jump
            {latitude: 10.1, longitude: -60.1},
        ];
        const gaps = computeGapIndices(points, ACTUAL_GAP_THRESHOLD_KM);
        expect(gaps).toContain(2);
    });

    it('uses custom threshold correctly', () => {
        const points = [
            {latitude: 55.0, longitude: 20.0},
            {latitude: 55.5, longitude: 20.5}, // ~60km
        ];
        // With 100km threshold no gap, with 30km threshold gap
        expect(computeGapIndices(points, 100)).toEqual([]);
        expect(computeGapIndices(points, 30)).toEqual([1]);
    });

    it('returns empty array for empty input', () => {
        expect(computeGapIndices([])).toEqual([]);
    });
});

describe('useMapDataStore trail operations', () => {
    beforeEach(() => {
        useMapDataStore.setState({
            vesselTrails: new Map(),
            vesselTrailGaps: new Map(),
        });
    });

    it('setVesselTrail stores trail and computes gap indices', () => {
        const trail: RoutePoint[] = [
            makePoint('2024-01-01T00:00:00Z', 55.0, 20.0),
            makePoint('2024-01-01T01:00:00Z', 55.1, 20.1),
        ];

        useMapDataStore.getState().setVesselTrail('v-001', trail);

        const state = useMapDataStore.getState();
        expect(state.vesselTrails.get('v-001')).toEqual(trail);
        expect(state.vesselTrailGaps.has('v-001')).toBe(true);
    });

    it('appendVesselTrailPoint appends and re-sorts by timestamp', () => {
        const initial: RoutePoint[] = [makePoint('2024-01-01T01:00:00Z', 55.0, 20.0)];
        useMapDataStore.getState().setVesselTrail('v-001', initial);

        const earlier = makePoint('2024-01-01T00:30:00Z', 54.9, 19.9);
        useMapDataStore.getState().appendVesselTrailPoint('v-001', earlier);

        const trail = useMapDataStore.getState().vesselTrails.get('v-001')!;
        expect(trail[0]!.timestamp).toBe('2024-01-01T00:30:00Z');
        expect(trail[1]!.timestamp).toBe('2024-01-01T01:00:00Z');
    });

    it('batchAppendTrailPoints skips duplicate timestamps', () => {
        const point = makePoint('2024-01-01T00:00:00Z');
        useMapDataStore.getState().setVesselTrail('v-001', [point]);

        const before = useMapDataStore.getState().vesselTrails;
        useMapDataStore.getState().batchAppendTrailPoints([{vesselId: 'v-001', point}]);
        const after = useMapDataStore.getState().vesselTrails;

        expect(before).toBe(after);
    });

    it('batchAppendTrailPoints trims to MAX_TRAIL_POINTS', () => {
        const baseMs = Date.parse('2024-01-01T00:00:00Z');
        const overLimit: RoutePoint[] = Array.from({length: MAX_TRAIL_POINTS}, (_, i) =>
            makePoint(new Date(baseMs + i * 60_000).toISOString()),
        );
        useMapDataStore.getState().setVesselTrail('v-001', overLimit);

        const extraMs = Date.parse('2024-01-01T00:00:00Z') + MAX_TRAIL_POINTS * 60_000;
        const extra = makePoint(new Date(extraMs).toISOString());
        useMapDataStore.getState().appendVesselTrailPoint('v-001', extra);

        const trail = useMapDataStore.getState().vesselTrails.get('v-001')!;
        expect(trail.length).toBe(MAX_TRAIL_POINTS);
    });

    it('clearVesselTrails empties both trails and gaps maps', () => {
        useMapDataStore.getState().setVesselTrail('v-001', [makePoint('2024-01-01T00:00:00Z')]);
        useMapDataStore.getState().clearVesselTrails();

        const state = useMapDataStore.getState();
        expect(state.vesselTrails.size).toBe(0);
        expect(state.vesselTrailGaps.size).toBe(0);
    });
});

describe('useMapDataStore vesselSetKey', () => {
    beforeEach(() => {
        useMapDataStore.setState({vessels: [], vesselSetKey: ''});
    });

    it('vesselSetKey changes when vessel set size changes', () => {
        const v1 = {
            vesselId: 'v-001', mmsi: '123', name: 'Test', latitude: 55, longitude: 20,
            heading: 0, course: 0, speed: 0, vesselType: 'CARGO', status: 'active' as const,
            timestamp: '2024-01-01T00:00:00Z',
        };

        useMapDataStore.getState().setVessels([v1]);
        const key1 = useMapDataStore.getState().vesselSetKey;

        const v2 = {...v1, vesselId: 'v-002', mmsi: '456'};
        useMapDataStore.getState().setVessels([v1, v2]);
        const key2 = useMapDataStore.getState().vesselSetKey;

        expect(key1).not.toBe(key2);
    });

    it('vesselSetKey stays stable when only positions change', () => {
        const v1 = {
            vesselId: 'v-001', mmsi: '123', name: 'Test', latitude: 55, longitude: 20,
            heading: 0, course: 0, speed: 0, vesselType: 'CARGO', status: 'active' as const,
            timestamp: '2024-01-01T00:00:00Z',
        };

        useMapDataStore.getState().setVessels([v1]);
        const key1 = useMapDataStore.getState().vesselSetKey;

        useMapDataStore.getState().setVessels([{...v1, latitude: 56, longitude: 21}]);
        const key2 = useMapDataStore.getState().vesselSetKey;

        expect(key1).toBe(key2);
    });
});

describe('useMapPreferencesStore syncActiveSources', () => {
    beforeEach(() => {
        useMapPreferencesStore.setState({dataMode: 'EMULATOR', activeSources: ['DEMO']});
    });

    it('sets EMULATED + DEMO when emulator is running', () => {
        useMapPreferencesStore.getState().syncActiveSources(true);
        expect(useMapPreferencesStore.getState().activeSources).toEqual(['EMULATED', 'DEMO']);
    });

    it('sets only DEMO when emulator is stopped', () => {
        useMapPreferencesStore.getState().syncActiveSources(false);
        expect(useMapPreferencesStore.getState().activeSources).toEqual(['DEMO']);
    });

    it('no-ops in LIVE dataMode', () => {
        useMapPreferencesStore.setState({dataMode: 'LIVE', activeSources: ['REAL', 'AIS_PROVIDER']});
        useMapPreferencesStore.getState().syncActiveSources(true);
        expect(useMapPreferencesStore.getState().activeSources).toEqual(['REAL', 'AIS_PROVIDER']);
    });
});
