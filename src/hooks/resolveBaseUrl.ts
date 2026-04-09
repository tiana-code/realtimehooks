
export function resolveBaseUrl(explicitBaseUrl?: string): string | undefined {
    if (explicitBaseUrl) return explicitBaseUrl;
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return undefined;
}
