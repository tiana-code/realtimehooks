import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type ColorMode = 'STATUS' | 'FUEL' | 'ALERTS' | 'SPEED';
export type TrailMode = 'ACTUAL' | 'PLANNED' | 'COMPARISON';
export type RouteLegend = 'SAFETY' | 'FUEL' | 'WEATHER' | 'TRAFFIC';

export interface LayerVisibility {
    vessels: boolean;
    trails: boolean;
    routes: boolean;
    waypoints: boolean;
    seaMap: boolean;
    heatmap: boolean;
    beacons: boolean;
    ports: boolean;
    weather: boolean;
    customLayers: boolean;
    currents: boolean;
    greatCircle: boolean;
    clustering: boolean;
    riskZones: boolean;
    vesselDensity: boolean;
    gfwFishing: boolean;
    conflictZones: boolean;
}

export interface TimelinePlayback {
    isEnabled: boolean;
    currentTime: number;
    startTime: number;
    endTime: number;
    isPlaying: boolean;
    playbackSpeed: number;
    loop: boolean;
}

const createDefaultTimelinePlayback = (): TimelinePlayback => {
    const now = Date.now();
    return {
        isEnabled: false,
        currentTime: now,
        startTime: now - 24 * 60 * 60 * 1000,
        endTime: now,
        isPlaying: false,
        playbackSpeed: 10,
        loop: false,
    };
};

interface MapPreferencesState {
    showRoutes: boolean;
    toggleRoutes: () => void;
    setShowRoutes: (show: boolean) => void;

    refreshRate: 5 | 10 | 30 | 60;
    setRefreshRate: (rate: 5 | 10 | 30 | 60) => void;

    center: [number, number];
    zoom: number;
    setCenter: (center: [number, number]) => void;
    setZoom: (zoom: number) => void;

    vesselTypeFilter: string;
    statusFilter: string;
    setVesselTypeFilter: (type: string) => void;
    setStatusFilter: (status: string) => void;

    layerVisibility: LayerVisibility;
    setLayerVisibility: (layer: keyof LayerVisibility, visible: boolean) => void;
    toggleLayer: (layer: keyof LayerVisibility) => void;

    colorMode: ColorMode;
    setColorMode: (mode: ColorMode) => void;
    trailMode: TrailMode;
    setTrailMode: (mode: TrailMode) => void;
    routeLegend: RouteLegend;
    setRouteLegend: (legend: RouteLegend) => void;

    activeSources: string[];
    setActiveSources: (sources: string[]) => void;
    dataMode: 'EMULATOR' | 'LIVE';
    setDataMode: (mode: 'EMULATOR' | 'LIVE') => void;
    syncActiveSources: (emulatorRunning: boolean) => void;

    timelinePlayback: TimelinePlayback;
    setTimelineEnabled: (enabled: boolean) => void;
    setTimelineCurrentTime: (time: number) => void;
    setTimelineRange: (start: number, end: number) => void;
    setTimelinePlaying: (playing: boolean) => void;
    setTimelineSpeed: (speed: number) => void;
    setTimelineLoop: (loop: boolean) => void;
}

export const useMapPreferencesStore = create<MapPreferencesState>()(
    persist(
        (set) => ({
            showRoutes: false,
            toggleRoutes: () =>
                set((state) => ({
                    showRoutes: !state.showRoutes,
                    layerVisibility: {...state.layerVisibility, routes: !state.showRoutes},
                })),
            setShowRoutes: (show) =>
                set((state) => ({
                    showRoutes: show,
                    layerVisibility: {...state.layerVisibility, routes: show},
                })),

            refreshRate: 5,
            setRefreshRate: (rate) => set({refreshRate: rate}),

            center: [30, 50],
            zoom: 4,
            setCenter: (center) => set({center}),
            setZoom: (zoom) => set({zoom}),

            vesselTypeFilter: 'all',
            statusFilter: 'all',
            setVesselTypeFilter: (type) => set({vesselTypeFilter: type}),
            setStatusFilter: (status) => set({statusFilter: status}),

            layerVisibility: {
                vessels: true, trails: true, routes: false, waypoints: true,
                seaMap: true, heatmap: false, beacons: false, ports: true,
                weather: false, customLayers: false, currents: false,
                greatCircle: false, clustering: false, riskZones: false,
                vesselDensity: false, gfwFishing: false, conflictZones: false,
            },
            setLayerVisibility: (layer, visible) =>
                set((state) => ({
                    layerVisibility: {...state.layerVisibility, [layer]: visible},
                    ...(layer === 'routes' ? {showRoutes: visible} : {}),
                })),
            toggleLayer: (layer) =>
                set((state) => ({
                    layerVisibility: {...state.layerVisibility, [layer]: !state.layerVisibility[layer]},
                    ...(layer === 'routes' ? {showRoutes: !state.layerVisibility[layer]} : {}),
                })),

            colorMode: 'SPEED',
            setColorMode: (mode) => set({colorMode: mode}),
            trailMode: 'ACTUAL',
            setTrailMode: (mode) => set({trailMode: mode}),
            routeLegend: 'SAFETY',
            setRouteLegend: (legend) => set({routeLegend: legend}),

            activeSources: ['DEMO'],
            setActiveSources: (sources) => set({activeSources: sources}),
            dataMode: 'EMULATOR' as const,
            setDataMode: (mode) =>
                set({
                    dataMode: mode,
                    activeSources: mode === 'EMULATOR' ? ['EMULATED', 'DEMO'] : ['REAL', 'AIS_PROVIDER'],
                }),
            syncActiveSources: (emulatorRunning) =>
                set((state) => {
                    if (state.dataMode !== 'EMULATOR') return state;
                    const next = emulatorRunning ? ['EMULATED', 'DEMO'] : ['DEMO'];
                    if (state.activeSources.length === next.length && state.activeSources.every((s, i) => s === next[i])) return state;
                    return {activeSources: next};
                }),

            timelinePlayback: createDefaultTimelinePlayback(),
            setTimelineEnabled: (enabled) =>
                set((state) => {
                    if (state.timelinePlayback.isEnabled === enabled) return state;
                    return {timelinePlayback: {...state.timelinePlayback, isEnabled: enabled}};
                }),
            setTimelineCurrentTime: (time) =>
                set((state) => {
                    if (!Number.isFinite(time)) return state;
                    const start = Number.isFinite(state.timelinePlayback.startTime) ? state.timelinePlayback.startTime : Date.now() - 24 * 60 * 60 * 1000;
                    const end = Number.isFinite(state.timelinePlayback.endTime) ? state.timelinePlayback.endTime : Date.now();
                    const clamped = Math.max(start, Math.min(end, time));
                    if (state.timelinePlayback.currentTime === clamped) return state;
                    return {timelinePlayback: {...state.timelinePlayback, currentTime: clamped}};
                }),
            setTimelineRange: (start, end) =>
                set((state) => {
                    if (!Number.isFinite(start) || !Number.isFinite(end)) return state;
                    const nextStart = Math.min(start, end);
                    const nextEnd = Math.max(start, end);
                    const nextCurrent = Math.max(nextStart, Math.min(nextEnd, state.timelinePlayback.currentTime));
                    if (state.timelinePlayback.startTime === nextStart && state.timelinePlayback.endTime === nextEnd && state.timelinePlayback.currentTime === nextCurrent) return state;
                    return {
                        timelinePlayback: {
                            ...state.timelinePlayback,
                            startTime: nextStart,
                            endTime: nextEnd,
                            currentTime: nextCurrent
                        }
                    };
                }),
            setTimelinePlaying: (playing) =>
                set((state) => {
                    if (state.timelinePlayback.isPlaying === playing) return state;
                    return {timelinePlayback: {...state.timelinePlayback, isPlaying: playing}};
                }),
            setTimelineSpeed: (speed) =>
                set((state) => {
                    if (!Number.isFinite(speed) || speed <= 0) return state;
                    if (state.timelinePlayback.playbackSpeed === speed) return state;
                    return {timelinePlayback: {...state.timelinePlayback, playbackSpeed: speed}};
                }),
            setTimelineLoop: (loop) =>
                set((state) => {
                    if (state.timelinePlayback.loop === loop) return state;
                    return {timelinePlayback: {...state.timelinePlayback, loop}};
                }),
        }),
        {
            name: 'realtimehooks-map-preferences-v1',
        },
    ),
);
