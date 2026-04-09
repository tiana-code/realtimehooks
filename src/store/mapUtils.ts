import type {RoutePoint} from '../types';

export const MAX_TRAIL_POINTS = 500;
export const ACTUAL_GAP_THRESHOLD_KM = 50;
export const PLANNED_GAP_THRESHOLD_KM = 200;
export const POSITION_DISPLAY_TTL = 60 * 60 * 1000;
export const POSITION_FRESH_TTL = 2 * 60 * 1000;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const haversineFactor =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(haversineFactor), Math.sqrt(1 - haversineFactor));
}

const timestampCache = new WeakMap<RoutePoint, number>();

export function getTimestampMs(point: RoutePoint): number {
    const cached = timestampCache.get(point);
    if (cached !== undefined) return cached;

    const ms = new Date(point.timestamp).getTime();
    const valid = Number.isFinite(ms) ? ms : 0;
    if (valid > 0) timestampCache.set(point, valid);
    return valid;
}

export const computeGapIndices = (
    points: ReadonlyArray<{ latitude: number; longitude: number }>,
    gapThresholdKm: number = ACTUAL_GAP_THRESHOLD_KM,
): number[] => {
    const gaps: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]!;
        const curr = points[i]!;
        if (haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude) > gapThresholdKm) {
            gaps.push(i);
        }
    }
    return gaps;
};
