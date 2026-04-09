export {useMapPreferencesStore} from './mapPreferencesStore';
export type {
    ColorMode,
    TrailMode,
    RouteLegend,
    TimelinePlayback,
    LayerVisibility,
} from './mapPreferencesStore';

export {useMapDataStore} from './mapDataStore';
export type {MapTimeRange} from './mapDataStore';

export {
    computeGapIndices,
    getTimestampMs,
    haversineKm,
    MAX_TRAIL_POINTS,
    ACTUAL_GAP_THRESHOLD_KM,
    PLANNED_GAP_THRESHOLD_KM,
    POSITION_DISPLAY_TTL,
    POSITION_FRESH_TTL,
} from './mapUtils';

export {useDashboardStore} from './dashboardStore';
export type {
    WidgetLayout,
    TimeRange,
    StoredTag,
    TagSelection,
    DashboardConfig,
    YAxisConfig,
    TagConfig,
    InsightStudioWidget,
    InsightStudioPage,
    InsightStudioConfig,
} from './dashboardStore';
