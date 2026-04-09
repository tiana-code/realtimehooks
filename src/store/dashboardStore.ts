import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {
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
} from '../types';

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
};

interface UserDashboardSettings {
    dashboardConfigs: Record<string, DashboardConfig>;
    activeDashboardId: string;
    insightStudioConfigs: Record<string, InsightStudioConfig>;
    activeInsightStudioId: string;
    defaultTimeRange: TimeRange;
    defaultRefreshInterval: number;
}

interface DashboardState {
    userSettings: Record<string, UserDashboardSettings>;
    currentUserId: string | null;
    getCurrentUserSettings: () => UserDashboardSettings;
    setCurrentUser: (userId: string | null) => void;

    setDashboardConfig: (id: string, config: Partial<DashboardConfig>) => void;
    getDashboardConfig: (id: string) => DashboardConfig | undefined;
    setActiveDashboard: (id: string) => void;
    updateDashboardLayout: (id: string, layouts: WidgetLayout[]) => void;
    updateDashboardTags: (id: string, tags: TagSelection[]) => void;
    updateDashboardTimeRange: (id: string, timeRange: TimeRange) => void;
    updateDashboardVessel: (id: string, vesselId: string) => void;

    setInsightStudioConfig: (id: string, config: Partial<InsightStudioConfig>) => void;
    getInsightStudioConfig: (id: string) => InsightStudioConfig | undefined;
    setActiveInsightStudio: (id: string) => void;
    updateInsightStudioWidgets: (id: string, widgets: InsightStudioWidget[]) => void;
    addInsightStudioWidget: (id: string, widget: InsightStudioWidget) => void;
    removeInsightStudioWidget: (configId: string, widgetId: string) => void;
    updateInsightStudioWidget: (
        configId: string,
        widgetId: string,
        updates: Partial<InsightStudioWidget>,
    ) => void;

    setDefaultTimeRange: (timeRange: TimeRange) => void;
    setDefaultRefreshInterval: (interval: number) => void;
    resetToDefaults: () => void;
}

function createDefaultTimeRange(): TimeRange {
    return {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        preset: 'last24h',
    };
}

function createDefaultDashboardConfig(): DashboardConfig {
    return {
        id: 'default',
        name: 'Main Dashboard',
        layouts: [],
        selectedTags: [],
        timeRange: createDefaultTimeRange(),
        refreshInterval: 30,
        lastModified: new Date().toISOString(),
    };
}

function createDefaultInsightStudioConfig(): InsightStudioConfig {
    return {
        id: 'default',
        name: 'Default Report',
        widgets: [],
        lastModified: new Date().toISOString(),
    };
}

function createDefaultUserSettings(): UserDashboardSettings {
    return {
        dashboardConfigs: {default: createDefaultDashboardConfig()},
        activeDashboardId: 'default',
        insightStudioConfigs: {default: createDefaultInsightStudioConfig()},
        activeInsightStudioId: 'default',
        defaultTimeRange: createDefaultTimeRange(),
        defaultRefreshInterval: 30,
    };
}

const GUEST_USER_ID = 'guest';

function updateUserSettings(
    state: DashboardState,
    updater: (userId: string, settings: UserDashboardSettings) => UserDashboardSettings,
): Partial<DashboardState> {
    const userId = state.currentUserId ?? GUEST_USER_ID;
    const current = state.userSettings[userId] ?? createDefaultUserSettings();
    return {
        userSettings: {
            ...state.userSettings,
            [userId]: updater(userId, current),
        },
    };
}

function mergeDashboardConfig(
    existing: DashboardConfig | undefined,
    id: string,
    patch: Partial<DashboardConfig>,
): DashboardConfig {
    return {...createDefaultDashboardConfig(), ...existing, ...patch, id} as DashboardConfig;
}

function mergeInsightStudioConfig(
    existing: InsightStudioConfig | undefined,
    id: string,
    patch: Partial<InsightStudioConfig>,
): InsightStudioConfig {
    return {...createDefaultInsightStudioConfig(), ...existing, ...patch, id} as InsightStudioConfig;
}

export const useDashboardStore = create<DashboardState>()(
    persist(
        (set, get) => ({
            userSettings: {},
            currentUserId: null,

            getCurrentUserSettings: () => {
                const state = get();
                const userId = state.currentUserId ?? GUEST_USER_ID;
                return state.userSettings[userId] ?? createDefaultUserSettings();
            },

            setCurrentUser: (userId) => set({currentUserId: userId}),

            setDashboardConfig: (id, config) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {
                                ...userSettings,
                                dashboardConfigs: {
                                    ...userSettings.dashboardConfigs,
                                    [id]: {
                                        ...createDefaultDashboardConfig(),
                                        ...userSettings.dashboardConfigs[id],
                                        ...config,
                                        id,
                                        lastModified: new Date().toISOString(),
                                    },
                                },
                            },
                        },
                    };
                }),

            getDashboardConfig: (id) => {
                return get().getCurrentUserSettings().dashboardConfigs[id];
            },

            setActiveDashboard: (id) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {...userSettings, activeDashboardId: id},
                        },
                    };
                }),

            updateDashboardLayout: (id, layouts) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => ({
                        ...s,
                        dashboardConfigs: {
                            ...s.dashboardConfigs,
                            [id]: mergeDashboardConfig(s.dashboardConfigs[id], id, {
                                layouts,
                                lastModified: new Date().toISOString(),
                            }),
                        },
                    })),
                ),

            updateDashboardTags: (id, tags) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => ({
                        ...s,
                        dashboardConfigs: {
                            ...s.dashboardConfigs,
                            [id]: mergeDashboardConfig(s.dashboardConfigs[id], id, {
                                selectedTags: tags,
                                lastModified: new Date().toISOString(),
                            }),
                        },
                    })),
                ),

            updateDashboardTimeRange: (id, timeRange) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => ({
                        ...s,
                        dashboardConfigs: {
                            ...s.dashboardConfigs,
                            [id]: mergeDashboardConfig(s.dashboardConfigs[id], id, {
                                timeRange,
                                lastModified: new Date().toISOString(),
                            }),
                        },
                    })),
                ),

            updateDashboardVessel: (id, vesselId) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => ({
                        ...s,
                        dashboardConfigs: {
                            ...s.dashboardConfigs,
                            [id]: mergeDashboardConfig(s.dashboardConfigs[id], id, {
                                selectedVesselId: vesselId,
                                lastModified: new Date().toISOString(),
                            }),
                        },
                    })),
                ),

            setInsightStudioConfig: (id, config) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {
                                ...userSettings,
                                insightStudioConfigs: {
                                    ...userSettings.insightStudioConfigs,
                                    [id]: {
                                        ...createDefaultInsightStudioConfig(),
                                        ...userSettings.insightStudioConfigs[id],
                                        ...config,
                                        id,
                                        lastModified: new Date().toISOString(),
                                    },
                                },
                            },
                        },
                    };
                }),

            getInsightStudioConfig: (id) => {
                return get().getCurrentUserSettings().insightStudioConfigs[id];
            },

            setActiveInsightStudio: (id) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {...userSettings, activeInsightStudioId: id},
                        },
                    };
                }),

            updateInsightStudioWidgets: (id, widgets) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => ({
                        ...s,
                        insightStudioConfigs: {
                            ...s.insightStudioConfigs,
                            [id]: mergeInsightStudioConfig(s.insightStudioConfigs[id], id, {
                                widgets,
                                lastModified: new Date().toISOString(),
                            }),
                        },
                    })),
                ),

            addInsightStudioWidget: (id, widget) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => {
                        const existing = s.insightStudioConfigs[id];
                        return {
                            ...s,
                            insightStudioConfigs: {
                                ...s.insightStudioConfigs,
                                [id]: mergeInsightStudioConfig(existing, id, {
                                    widgets: [...(existing?.widgets ?? []), widget],
                                    lastModified: new Date().toISOString(),
                                }),
                            },
                        };
                    }),
                ),

            removeInsightStudioWidget: (configId, widgetId) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => {
                        const existing = s.insightStudioConfigs[configId];
                        return {
                            ...s,
                            insightStudioConfigs: {
                                ...s.insightStudioConfigs,
                                [configId]: mergeInsightStudioConfig(existing, configId, {
                                    widgets: (existing?.widgets ?? []).filter((w) => w.id !== widgetId),
                                    lastModified: new Date().toISOString(),
                                }),
                            },
                        };
                    }),
                ),

            updateInsightStudioWidget: (configId, widgetId, updates) =>
                set((state) =>
                    updateUserSettings(state, (_uid, s) => {
                        const existing = s.insightStudioConfigs[configId];
                        return {
                            ...s,
                            insightStudioConfigs: {
                                ...s.insightStudioConfigs,
                                [configId]: mergeInsightStudioConfig(existing, configId, {
                                    widgets: (existing?.widgets ?? []).map((w) =>
                                        w.id === widgetId ? {...w, ...updates} : w,
                                    ),
                                    lastModified: new Date().toISOString(),
                                }),
                            },
                        };
                    }),
                ),

            setDefaultTimeRange: (timeRange) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {...userSettings, defaultTimeRange: timeRange},
                        },
                    };
                }),

            setDefaultRefreshInterval: (interval) =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    const userSettings = state.userSettings[userId] ?? createDefaultUserSettings();
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: {...userSettings, defaultRefreshInterval: interval},
                        },
                    };
                }),

            resetToDefaults: () =>
                set((state) => {
                    const userId = state.currentUserId ?? GUEST_USER_ID;
                    return {
                        userSettings: {
                            ...state.userSettings,
                            [userId]: createDefaultUserSettings(),
                        },
                    };
                }),
        }),
        {
            name: 'realtimehooks-dashboard-v1',
            version: 1,
            migrate: (persisted, version) => {
                if (version === 0 || version === undefined) return persisted as DashboardState;
                return persisted as DashboardState;
            },
        },
    ),
);
