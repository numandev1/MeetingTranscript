/** Download folder used when the user has not chosen one. */
export const DEFAULT_DOWNLOAD_SUBFOLDER = "TranscripTonic"

/** Vault folder used when the user has not chosen one. */
export const DEFAULT_OBSIDIAN_FOLDER = "Meetings"

/** Vault folder for summaries when the user has not chosen one. */
export const DEFAULT_OBSIDIAN_SUMMARY_FOLDER = "MeetingSummary"

/**
 * Turns a user-supplied folder into a path prefix safe for both chrome.downloads and
 * the Obsidian vault.
 *
 * chrome.downloads.download() rejects absolute paths, drive letters and any ".."
 * component — the file must land inside the browser's Downloads directory — and the
 * Obsidian REST API has the same vault-relative constraint. Anything that would escape
 * the root is stripped rather than rejected, so a bad value degrades to saving at the
 * root instead of failing the save entirely.
 *
 * @returns "" (save at the root) or "some/folder/" ready to prefix a file name
 */
export function getFolderPrefix(subfolder: string | undefined, defaultFolder: string): string {
    if (typeof subfolder !== "string") {
        return `${defaultFolder}/`
    }

    const segments = subfolder
        // Accept Windows-style input, normalise to forward slashes
        .replace(/\\/g, "/")
        .split("/")
        .map(segment => segment
            .trim()
            // Characters that are invalid in file names on at least one supported OS
            .replace(/[:?"*<>|\u{0}-\u{1f}\u{7f}]/gu, "")
            // A segment of dots only would either be "." or an escape attempt
            .replace(/^\.+$/, "")
        )
        .filter(segment => segment.length > 0)

    if (segments.length === 0) {
        return ""
    }

    return `${segments.join("/")}/`
}
