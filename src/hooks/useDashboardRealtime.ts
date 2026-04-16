import {useCallback, useMemo} from 'react';
import {useTelemetryStream, useAggregatedMetricsStream} from './useTelemetryStream';
import {useAlertStream, useAlertSummaryStream} from './useAlertStream';
import type {TelemetryValue, AggregatedMetrics, Alert, AlertSummary, StreamError} from '../types';

export interface DashboardRealtimeData {
    telemetry: TelemetryValue[];
    aggregatedMetrics: AggregatedMetrics | null;
    alerts: Alert[];
    alertSummary: AlertSummary | null;

    connections: {
        telemetry: boolean;
        aggregatedMetrics: boolean;
        alerts: boolean;
        alertSummary: boolean;
    };

    errors: {
        telemetry: StreamError | null;
        aggregatedMetrics: StreamError | null;
        alerts: StreamError | null;
        alertSummary: StreamError | null;
    };

    health: {
        isFullyConnected: boolean;
        isAnyConnected: boolean;
        hasAnyError: boolean;
    };

    reconnectAll: () => void;
}

interface UseDashboardRealtimeOptions {
    vesselId?: string | undefined;
    tagCodes?: string[] | undefined;
    telemetryInterval?: number | undefined;

    vesselIds?: string[] | undefined;
    aggregationTagCodes?: string[] | undefined;
    aggregationInterval?: number | undefined;

    alertVesselFilter?: string | undefined;
    alertSeverityFilter?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
    alertInterval?: number | undefined;
    alertSummaryInterval?: number | undefined;

    enableTelemetry?: boolean | undefined;
    enableAggregatedMetrics?: boolean | undefined;
    enableAlerts?: boolean | undefined;
    enableAlertSummary?: boolean | undefined;

    baseUrl?: string | undefined;
}

export const useDashboardRealtime = ({
                                         vesselId,
                                         tagCodes = [],
                                         telemetryInterval = 5,
                                         vesselIds,
                                         aggregationTagCodes = [],
                                         aggregationInterval = 30,
                                         alertVesselFilter,
                                         alertSeverityFilter,
                                         alertInterval = 5,
                                         alertSummaryInterval = 30,
                                         enableTelemetry = true,
                                         enableAggregatedMetrics = false,
                                         enableAlerts = true,
                                         enableAlertSummary = true,
                                         baseUrl,
                                     }: UseDashboardRealtimeOptions): DashboardRealtimeData => {
    const {
        data: telemetry,
        isConnected: telemetryConnected,
        error: telemetryError,
        reconnect: reconnectTelemetry,
    } = useTelemetryStream({
        vesselId: vesselId || '',
        tagCodes,
        intervalSeconds: telemetryInterval,
        enabled: enableTelemetry && !!vesselId && tagCodes.length > 0,
        baseUrl,
    });

    const {
        data: aggregatedMetrics,
        isConnected: aggregatedConnected,
        error: aggregatedError,
        reconnect: reconnectAggregated,
    } = useAggregatedMetricsStream({
        vesselIds,
        tagCodes: aggregationTagCodes,
        intervalSeconds: aggregationInterval,
        enabled: enableAggregatedMetrics && aggregationTagCodes.length > 0,
        baseUrl,
    });

    const {
        alerts,
        isConnected: alertsConnected,
        error: alertsError,
        reconnect: reconnectAlerts,
    } = useAlertStream({
        vesselId: alertVesselFilter,
        severity: alertSeverityFilter,
        intervalSeconds: alertInterval,
        enabled: enableAlerts,
        baseUrl,
    });

    const {
        summary: alertSummary,
        isConnected: summaryConnected,
        error: summaryError,
        reconnect: reconnectSummary,
    } = useAlertSummaryStream({
        intervalSeconds: alertSummaryInterval,
        enabled: enableAlertSummary,
        baseUrl,
    });

    const reconnectAll = useCallback(() => {
        if (enableTelemetry) reconnectTelemetry();
        if (enableAggregatedMetrics) reconnectAggregated();
        if (enableAlerts) reconnectAlerts();
        if (enableAlertSummary) reconnectSummary();
    }, [
        enableTelemetry,
        enableAggregatedMetrics,
        enableAlerts,
        enableAlertSummary,
        reconnectTelemetry,
        reconnectAggregated,
        reconnectAlerts,
        reconnectSummary,
    ]);

    const connections = useMemo(
        () => ({
            telemetry: telemetryConnected,
            aggregatedMetrics: aggregatedConnected,
            alerts: alertsConnected,
            alertSummary: summaryConnected,
        }),
        [telemetryConnected, aggregatedConnected, alertsConnected, summaryConnected],
    );

    const errors = useMemo(
        () => ({
            telemetry: telemetryError,
            aggregatedMetrics: aggregatedError,
            alerts: alertsError,
            alertSummary: summaryError,
        }),
        [telemetryError, aggregatedError, alertsError, summaryError],
    );

    const enabledStreams = useMemo(() => {
        const entries: Array<[string, boolean]> = [];
        if (enableTelemetry && !!vesselId && tagCodes.length > 0) entries.push(['telemetry', telemetryConnected]);
        if (enableAggregatedMetrics && aggregationTagCodes.length > 0) entries.push(['aggregatedMetrics', aggregatedConnected]);
        if (enableAlerts) entries.push(['alerts', alertsConnected]);
        if (enableAlertSummary) entries.push(['alertSummary', summaryConnected]);
        return entries;
    }, [enableTelemetry, enableAggregatedMetrics, enableAlerts, enableAlertSummary, vesselId, tagCodes.length, aggregationTagCodes.length, telemetryConnected, aggregatedConnected, alertsConnected, summaryConnected]);

    const health = {
        isFullyConnected: enabledStreams.length > 0 && enabledStreams.every(([, c]) => c),
        isAnyConnected: enabledStreams.some(([, c]) => c),
        hasAnyError: Object.values(errors).some((e) => e !== null),
    };

    return {
        telemetry,
        aggregatedMetrics,
        alerts,
        alertSummary,
        connections,
        errors,
        health,
        reconnectAll,
    };
};

export const useVesselDashboardRealtime = (
    vesselId: string | null,
    tagCodes: string[] = ['ME_RPM', 'ME_LO_TEMP', 'TANK_FO_PORT', 'NAV_SOG'],
) => {
    return useDashboardRealtime({
        vesselId: vesselId || undefined,
        tagCodes,
        telemetryInterval: 5,
        alertVesselFilter: vesselId || undefined,
        enableTelemetry: !!vesselId,
        enableAggregatedMetrics: false,
        enableAlerts: true,
        enableAlertSummary: true,
    });
};

export const useFleetDashboardRealtime = (
    tagCodes: string[] = ['ME_RPM', 'TANK_FO_PORT', 'NAV_SOG'],
) => {
    return useDashboardRealtime({
        aggregationTagCodes: tagCodes,
        aggregationInterval: 30,
        enableTelemetry: false,
        enableAggregatedMetrics: true,
        enableAlerts: true,
        enableAlertSummary: true,
    });
};

export default useDashboardRealtime;
