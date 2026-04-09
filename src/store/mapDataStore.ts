import {create} from 'zustand';
import type {
    VesselPosition,
    VesselSummary,
    VesselRoute,
    RoutePoint,
    ComparisonData,
} from '../types';
import {computeGapIndices, getTimestampMs, haversineKm, MAX_TRAIL_POINTS, ACTUAL_GAP_THRESHOLD_KM} from './mapUtils';
import {useMapPreferencesStore} from './mapPreferencesStore';

export interface MapTimeRange {
    from: Date | null;
    to: Date | null;
    live: boolean;
}

interface MapDataState {
    totalVesselCount: number;
    setTotalVesselCount: (count: number) => void;
    useViewportQueries: boolean;

    timeRange: MapTimeRange;
    setTimeRange: (range: MapTimeRange) => void;
    setLiveMode: (live: boolean) => void;

    selectedVessel: VesselSummary | null;
    setSelectedVessel: (vessel: VesselSummary | null) => void;

    vessels: VesselPosition[];
    vesselSetKey: string;
    setVessels: (vessels: VesselPosition[]) => void;
    updateVesselPosition: (position: VesselPosition) => void;

    routes: Map<string, VesselRoute>;
    setRoute: (vesselId: string, route: VesselRoute) => void;
    clearRoutes: () => void;

    vesselTrails: Map<string, RoutePoint[]>;
    vesselTrailGaps: Map<string, number[]>;
    setVesselTrail: (vesselId: string, trail: RoutePoint[]) => void;
    setAllVesselTrails: (trails: Map<string, RoutePoint[]>) => void;
    clearVesselTrails: () => void;
    appendVesselTrailPoint: (vesselId: string, point: RoutePoint) => void;
    batchAppendTrailPoints: (entries: Array<{ vesselId: string; point: RoutePoint }>) => void;

    comparisonData: Map<string, ComparisonData>;
    setComparisonData: (vesselId: string, data: ComparisonData) => void;
    clearComparisonData: () => void;

    zoomToVessel: (vessel: VesselSummary) => void;

    isConnected: boolean;
    setConnected: (connected: boolean) => void;
    lastUpdate: Date | null;
    setLastUpdate: (date: Date) => void;

    departurePoints: Map<string, [number, number]>;
    setDeparturePoints: (points: Map<string, [number, number]>) => void;

    routeGeometryCache: Map<string, [number, number][]>;
}

export const useMapDataStore = create<MapDataState>()(
    (set, get) => ({
        totalVesselCount: 0,
        setTotalVesselCount: (count) =>
            set({totalVesselCount: count, useViewportQueries: count > 200}),
        useViewportQueries: false,

        timeRange: {from: null, to: null, live: true},
        setTimeRange: (range) => set({timeRange: range}),
        setLiveMode: (live) =>
            set((state) => {
                const updates: Partial<MapDataState> = {
                    timeRange: {
                        ...state.timeRange,
                        live,
                        from: live ? null : state.timeRange.from,
                        to: live ? null : state.timeRange.to,
                    },
                };
                if (live) {
                    const prefs = useMapPreferencesStore.getState();
                    if (prefs.timelinePlayback.isEnabled) {
                        prefs.setTimelineEnabled(false);
                    }
                }
                return updates;
            }),

        selectedVessel: null,
        setSelectedVessel: (vessel) => set({selectedVessel: vessel}),

        vessels: [],
        vesselSetKey: '',
        setVessels: (vessels) =>
            set(() => {
                const vesselSetKey = vessels.map((v) => v.vesselId).sort().join(',');
                return {vessels, vesselSetKey, lastUpdate: new Date()};
            }),
        updateVesselPosition: (position) =>
            set((state) => {
                const index = state.vessels.findIndex((v) => v.mmsi === position.mmsi);
                if (index >= 0) {
                    const newVessels = [...state.vessels];
                    newVessels[index] = position;
                    return {vessels: newVessels, lastUpdate: new Date()};
                }
                return {vessels: [...state.vessels, position], lastUpdate: new Date()};
            }),

        routes: new Map(),
        setRoute: (vesselId, route) =>
            set((state) => {
                const newRoutes = new Map(state.routes);
                newRoutes.set(vesselId, route);
                return {routes: newRoutes};
            }),
        clearRoutes: () => set({routes: new Map()}),

        vesselTrails: new Map(),
        vesselTrailGaps: new Map(),

        setVesselTrail: (vesselId, trail) =>
            set((state) => {
                const newTrails = new Map(state.vesselTrails);
                newTrails.set(vesselId, trail);
                const newGaps = new Map(state.vesselTrailGaps);
                newGaps.set(vesselId, computeGapIndices(trail));
                return {vesselTrails: newTrails, vesselTrailGaps: newGaps};
            }),

        setAllVesselTrails: (trails) => {
            const newGaps = new Map<string, number[]>();
            trails.forEach((trail, vesselId) => {
                newGaps.set(vesselId, computeGapIndices(trail));
            });
            set({vesselTrails: trails, vesselTrailGaps: newGaps});
        },

        clearVesselTrails: () => set({vesselTrails: new Map(), vesselTrailGaps: new Map()}),

        appendVesselTrailPoint: (vesselId, point) =>
            set((state) => {
                const newTrails = new Map(state.vesselTrails);
                const existing = newTrails.get(vesselId) || [];
                const updated = [...existing, point].filter((p) => getTimestampMs(p) > 0);
                updated.sort((a, b) => getTimestampMs(a) - getTimestampMs(b));
                const trimmed = updated.length > MAX_TRAIL_POINTS ? updated.slice(-MAX_TRAIL_POINTS) : updated;
                newTrails.set(vesselId, trimmed);
                const newGaps = new Map(state.vesselTrailGaps);
                newGaps.set(vesselId, computeGapIndices(trimmed));
                return {vesselTrails: newTrails, vesselTrailGaps: newGaps};
            }),

        batchAppendTrailPoints: (entries) =>
            set((state) => {
                if (entries.length === 0) return state;

                let newTrails: Map<string, RoutePoint[]> | null = null;
                let newGaps: Map<string, number[]> | null = null;
                let modified = false;

                for (const {vesselId, point} of entries) {
                    const existing = (newTrails ?? state.vesselTrails).get(vesselId) || [];
                    const pointMs = getTimestampMs(point);
                    if (pointMs > 0 && existing.some((p) => getTimestampMs(p) === pointMs)) continue;

                    if (!modified) {
                        newTrails = new Map(state.vesselTrails);
                        newGaps = new Map(state.vesselTrailGaps);
                        modified = true;
                    }

                    const updated = [...existing, point].filter((p) => getTimestampMs(p) > 0);
                    updated.sort((a, b) => getTimestampMs(a) - getTimestampMs(b));
                    const trimmed = updated.length > MAX_TRAIL_POINTS ? updated.slice(-MAX_TRAIL_POINTS) : updated;
                    newTrails!.set(vesselId, trimmed);

                    if (trimmed.length === updated.length && existing.length === trimmed.length - 1) {
                        const prevGaps = newGaps!.get(vesselId) ?? [];
                        if (trimmed.length >= 2) {
                            const prev = trimmed[trimmed.length - 2]!;
                            const curr = trimmed[trimmed.length - 1]!;
                            const dist = haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
                            if (dist > ACTUAL_GAP_THRESHOLD_KM) {
                                newGaps!.set(vesselId, [...prevGaps, trimmed.length - 1]);
                            } else {
                                newGaps!.set(vesselId, prevGaps);
                            }
                        } else {
                            newGaps!.set(vesselId, []);
                        }
                    } else {
                        newGaps!.set(vesselId, computeGapIndices(trimmed));
                    }
                }

                if (!modified) return state;
                return {vesselTrails: newTrails!, vesselTrailGaps: newGaps!};
            }),

        comparisonData: new Map(),
        setComparisonData: (vesselId, data) =>
            set((state) => {
                const newData = new Map(state.comparisonData);
                newData.set(vesselId, data);
                return {comparisonData: newData};
            }),
        clearComparisonData: () => set({comparisonData: new Map()}),

        zoomToVessel: (vessel) => {
            const vesselPos = get().vessels.find((v) => v.vesselId === vessel.vesselId);
            if (vesselPos) {
                const prefs = useMapPreferencesStore.getState();
                prefs.setCenter([vesselPos.longitude, vesselPos.latitude]);
                prefs.setZoom(12);
                set({selectedVessel: vessel});
            }
        },

        isConnected: false,
        setConnected: (connected) => set({isConnected: connected}),
        lastUpdate: null,
        setLastUpdate: (date) => set({lastUpdate: date}),

        departurePoints: new Map(),
        setDeparturePoints: (points) => set({departurePoints: points}),

        routeGeometryCache: new Map(),
    }),
);
