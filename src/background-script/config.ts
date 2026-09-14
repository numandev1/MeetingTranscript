import type { Platform } from "@lib/types"

export const TIMEFORMAT: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
}

export interface PlatformConfig {
    id: string
    /** Bundles emitted by webpack. Keep in sync with the entry names in webpack.config.js. */
    js: string[]
    matches: string[]
    excludeMatches: string[]
    permissions: chrome.runtime.ManifestPermissions[]
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
    "google_meet": {
        id: "content-google-meet",
        js: ["contentGoogleMeet.js"],
        matches: ["https://meet.google.com/*"],
        excludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
        permissions: ["notifications"]
    },
    "teams": {
        id: "content-teams",
        js: ["contentTeams.js"],
        matches: [
            "https://teams.live.com/*",
            "https://teams.microsoft.com/*",
            "https://teams.cloud.microsoft/*",
            // Defender for Cloud Apps reverse proxy suffixes the app host, ex. teams.cloud.microsoft.mcas.ms
            "https://teams.microsoft.com.mcas.ms/*",
            "https://teams.cloud.microsoft.mcas.ms/*",
            "https://teams.microsoft.com.mcas-gov.us/*",
            "https://teams.cloud.microsoft.mcas-gov.us/*",
            "https://teams.microsoft.com.mcas-gov.ms/*",
            "https://teams.cloud.microsoft.mcas-gov.ms/*"
        ],
        excludeMatches: [],
        permissions: ["notifications"]
    },
    "zoom": {
        id: "content-zoom",
        js: ["contentZoom.js"],
        matches: ["https://*.zoom.us/*"],
        excludeMatches: [],
        permissions: ["notifications", "declarativeNetRequestWithHostAccess"]
    }
}

export const ALARM_NAME = "dailyPermissionCheck"
export const INTERVAL_IN_MINUTES = 24 * 60 // 24 hours
