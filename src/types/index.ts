export interface TelemetryValue {
    tagCode: string;
    value: number;
    timestamp: string;
}

export interface AggregatedMetrics {
    aggregatedByTag: Record<string, { min: number; max: number; avg: number; count: number }>;
    byVessel: Record<string, Record<string, number>>;
    vesselCount: number;
    timestamp: number;
}

export interface Alert {
    id: number;
    ruleId: number;
    ruleName: string;
    vesselId: string;
    geozoneId?: number;
    severity: AlertSeverity;
    status: AlertStatus;
    tagsInvolved: string[];
    triggerValue?: Record<string, unknown>;
    thresholdValue?: Record<string, unknown>;
    startTime: string;
    endTime?: string;
    durationSeconds?: number;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    notes?: string;
    createdAt: string;
}

export interface AlertSummary {
    totalActive: number;
    bySeverity: Record<AlertSeverity, number>;
    byVessel: Record<string, number>;
    critical: number;
    high: number;
    medium: number;
    low: number;
    timestamp: number;
}

export interface RoutePoint {
    latitude: number;
    longitude: number;
    timestamp: string;
    speed?: number;
    heading?: number;
    // True when reported heading contradicts movement direction
    isCourseAnomaly?: boolean;
}

export interface VesselPosition {
    mmsi: string;
    vesselId: string;
    name: string;
    latitude: number;
    longitude: number;
    heading: number;
    course: number;
    speed: number;
    vesselType: string;
    status: 'active' | 'maintenance' | 'offline';
    timestamp: string;
    recordedAt?: string;
    navStatus?: string;
    destination?: string;
    flag?: string;
    imoNumber?: string;
    callSign?: string;
    source?: 'edge_agent' | 'emulator' | 'aishub' | 'marinetraffic' | 'datalastic' | 'extrapolated';
    isExtrapolated?: boolean;
    confidence?: number;
    isDemoData?: boolean;
    dataSource?: string;
    stale?: boolean;
    fuelPercent?: number;
}

export interface VesselSummary {
    id: string;
    vesselId: string;
    name: string;
    mmsi: string;
    imoNumber?: string;
    vesselType: string;
    status: 'active' | 'maintenance' | 'offline';
}

export interface VesselRoute {
    vesselId: string;
    points: RoutePoint[];
    plannedDestination?: {
        latitude: number;
        longitude: number;
        name?: string;
        eta?: string;
    };
    // Dense [lon, lat] trajectory from server LINESTRINGM
    trajectoryPath?: [number, number][];
}

export interface ComparisonData {
    actual: RoutePoint[];
    planned: RoutePoint[];
    deviation: {
        maxDeviationNm: number;
        avgDeviationNm: number;
        deviationPoints: Array<{
            actualLat: number;
            actualLon: number;
            plannedLat: number;
            plannedLon: number;
            deviationNm: number;
            timestamp: string;
        }>;
    };
    isDemoData: boolean;
}

export interface IsochronePoint {
    latitude: number;
    longitude: number;
    bearing_from_origin: number;
    effective_speed_knots: number;
    time_hours: number;
    wind_speed_ms: number;
    wave_height_m: number;
}

export interface IsochroneContour {
    time_hours: number;
    timestamp: string;
    points: IsochronePoint[];
    polygon_geojson?: GeoJSON.Feature;
}

export interface OptimalRoutePoint {
    sequence: number;
    latitude: number;
    longitude: number;
    timestamp: string;
    bearing: number;
    distance_from_prev_nm: number;
    cumulative_distance_nm: number;
    effective_speed_knots: number;
    wind_speed_ms: number;
    wave_height_m: number;
}

export interface IsochroneResult {
    vessel_id: string;
    calculation_timestamp: string;
    origin: [number, number];
    destination?: [number, number];
    departure_time: string;
    base_speed_knots: number;
    contours: IsochroneContour[];
    contours_geojson?: GeoJSON.FeatureCollection;
    optimal_route?: OptimalRoutePoint[];
    optimal_route_geojson?: GeoJSON.Feature;
    arrival_time_estimate?: string;
    total_distance_nm?: number;
    direct_route_distance_nm?: number;
    direct_route_hours?: number;
    time_savings_vs_direct_hours?: number;
    fuel_savings_percent?: number;
    max_wave_height_m: number;
    max_wind_speed_ms: number;
    weather_windows: Array<{
        start_time: string;
        end_time: string;
        description: string;
        severity: string;
    }>;
}

export interface IsochroneRequest {
    vessel_id: string;
    origin: [number, number];
    destination?: [number, number];
    departure_time: Date;
    base_speed_knots: number;
    forecast_window_hours?: number;
    time_step_hours?: number;
    bearing_step_degrees?: number;
}

// Dashboard
export interface WidgetLayout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
}

export interface TimeRange {
    start: Date | string;
    end: Date | string;
    preset?: 'last1h' | 'last6h' | 'last24h' | 'last7d' | 'last30d' | 'custom';
}

export interface StoredTag {
    id: string;
    code: string;
    name: string;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    unitSymbol?: string;
    unitName?: string;
    dataType: 'FLOAT' | 'INTEGER' | 'BOOLEAN' | 'STRING';
    minValue?: number;
    maxValue?: number;
    warningLow?: number;
    warningHigh?: number;
    criticalLow?: number;
    criticalHigh?: number;
    precision: number;
    enabled: boolean;
}

export interface TagSelection {
    value: string;
    label: string;
    tag: StoredTag;
}

export interface DashboardConfig {
    id: string;
    name: string;
    layouts: WidgetLayout[];
    selectedTags: TagSelection[];
    timeRange: TimeRange;
    selectedVesselId?: string;
    refreshInterval: number;
    lastModified: string;
}

export interface YAxisConfig {
    label?: string;
    min?: number;
    max?: number;
    scale?: 'linear' | 'log';
}

export interface TagConfig {
    tagCode: string;
    customTitle?: string;
    axisId?: 'left' | 'right';
    color?: string;
    order?: number;
}

export interface InsightStudioWidget {
    id: string;
    type: 'line' | 'bar' | 'gauge' | 'table' | 'map' | 'mimic' | 'donut' | 'scatter' | 'histogram' | 'treemap' | 'kpi';
    title: string;
    size: { w: number; h: number };
    position?: { x: number; y: number };
    data?: unknown;
    mimicImage?: string;
    collapsed?: boolean;
    refreshInterval?: number;
    tagPoints?: Array<{
        id: string;
        x: number;
        y: number;
        tag: string;
        value?: number;
        unit?: string;
    }>;
    yAxisConfig?: YAxisConfig;
    secondYAxisConfig?: YAxisConfig;
    tagConfigs?: TagConfig[];
}

export interface InsightStudioPage {
    id: string;
    name: string;
    widgets: InsightStudioWidget[];
    order: number;
}

export interface InsightStudioConfig {
    id: string;
    name: string;
    widgets: InsightStudioWidget[];
    pages?: InsightStudioPage[];
    status?: 'draft' | 'published';
    lastModified: string;
}

export type StreamStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disabled';

export type StreamErrorCode = 'CONNECTION_FAILED' | 'PAYLOAD_INVALID' | 'UNSUPPORTED_ENVIRONMENT';

export interface StreamError {
    code: StreamErrorCode;
    message: string;
    cause?: unknown;
    retryable: boolean;
}

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
