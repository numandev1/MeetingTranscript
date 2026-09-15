import type { ResultSync } from "./types"
import { DEFAULT_OBSIDIAN_FOLDER, DEFAULT_OBSIDIAN_SUMMARY_FOLDER } from "./paths"

/** Bumped only when the shape changes in a way older builds cannot read. */
export const SETTINGS_FILE_VERSION = 1

export const SETTINGS_FILE_KIND = "meetingtranscript-settings"

/**
 * Every synced setting, listed once so export and import cannot drift apart.
 * Adding a setting means adding it here, and both directions pick it up.
 */
export const TRANSFERABLE_SYNC_KEYS = [
    "operationMode",
    "hideCaptions",
    "participantName",
    "autoPostWebhookAfterMeeting",
    "autoDownloadFileAfterMeeting",
    "downloadSubfolder",
    "webhookUrl",
    "webhookBodyType",
    "obsidianEnabled",
    "obsidianFolder",
    "obsidianSummaryFolder",
    "obsidianBaseUrl",
    "wantGoogleMeet",
    "wantTeams",
    "wantZoom",
] as const satisfies readonly (keyof ResultSync)[]

export interface SettingsFile {
    kind: typeof SETTINGS_FILE_KIND
    version: number
    exportedAt: string
    settings: Partial<ResultSync>
    /**
     * Present only when the user chose to include it. The key normally stays in local
     * storage so it never leaves the device, so carrying it in a file is an explicit
     * decision rather than a default.
     */
    obsidianApiKey?: string
}

export function buildSettingsFile(settings: Partial<ResultSync>, obsidianApiKey?: string): SettingsFile {
    const exported: Partial<ResultSync> = {}
    for (const key of TRANSFERABLE_SYNC_KEYS) {
        if (settings[key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (exported as any)[key] = settings[key]
        }
    }

    const file: SettingsFile = {
        kind: SETTINGS_FILE_KIND,
        version: SETTINGS_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        settings: exported,
    }
    if (obsidianApiKey) {
        file.obsidianApiKey = obsidianApiKey
    }
    return file
}

export interface ParsedSettingsFile {
    settings: Partial<ResultSync>
    obsidianApiKey?: string
}

/**
 * Reads an exported file back, keeping only keys this build knows about and only when
 * the value is the expected type.
 *
 * A settings file is user-supplied input that may come from another machine or a newer
 * build, so nothing is written to storage on trust: an unknown key is dropped rather
 * than stored, and a wrong-typed value is dropped rather than corrupting a setting.
 */
export function parseSettingsFile(raw: string): ParsedSettingsFile {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    }
    catch {
        throw new Error("That file is not valid JSON.")
    }

    if (!parsed || typeof parsed !== "object") {
        throw new Error("That file does not contain MeetingTranscript settings.")
    }

    const file = parsed as Partial<SettingsFile>
    if (file.kind !== SETTINGS_FILE_KIND) {
        throw new Error("That file was not exported from MeetingTranscript.")
    }
    if (typeof file.version !== "number" || file.version > SETTINGS_FILE_VERSION) {
        throw new Error("That file was exported from a newer version. Update MeetingTranscript first.")
    }
    if (!file.settings || typeof file.settings !== "object") {
        throw new Error("That settings file is empty.")
    }

    const source = file.settings as Record<string, unknown>
    const settings: Record<string, unknown> = {}

    for (const key of TRANSFERABLE_SYNC_KEYS) {
        const value = source[key]
        if (value === undefined) {
            continue
        }
        // Only the two shapes any setting actually uses
        if (typeof value === "string" || typeof value === "boolean") {
            settings[key] = value
        }
    }

    if (Object.keys(settings).length === 0) {
        throw new Error("That settings file has nothing this version can use.")
    }

    return {
        settings: settings as Partial<ResultSync>,
        obsidianApiKey: typeof file.obsidianApiKey === "string" && file.obsidianApiKey
            ? file.obsidianApiKey
            : undefined
    }
}

/**
 * Applies the import rule that Obsidian is on by default for a transferred setup:
 * a machine that receives a configuration is being set up to file notes, so the
 * integration is switched on and any folder it needs is filled in.
 */
export function withObsidianEnabled(settings: Partial<ResultSync>): Partial<ResultSync> {
    return {
        ...settings,
        obsidianEnabled: true,
        obsidianFolder: typeof settings.obsidianFolder === "string"
            ? settings.obsidianFolder
            : DEFAULT_OBSIDIAN_FOLDER,
        obsidianSummaryFolder: typeof settings.obsidianSummaryFolder === "string"
            ? settings.obsidianSummaryFolder
            : DEFAULT_OBSIDIAN_SUMMARY_FOLDER,
    }
}

/** Platforms the imported settings say should be active. */
export function getWantedPlatforms(settings: Partial<ResultSync>): ("google_meet" | "teams" | "zoom")[] {
    const wanted: ("google_meet" | "teams" | "zoom")[] = []
    if (settings.wantGoogleMeet) wanted.push("google_meet")
    if (settings.wantTeams) wanted.push("teams")
    if (settings.wantZoom) wanted.push("zoom")
    return wanted
}
