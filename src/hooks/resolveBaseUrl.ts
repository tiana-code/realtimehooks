
export function resolveBaseUrl(explicitBaseUrl?: string): string {
    if (explicitBaseUrl) return explicitBaseUrl;
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}
