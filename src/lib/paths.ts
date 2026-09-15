/** Download folder used when the user has not chosen one. */
export const DEFAULT_DOWNLOAD_SUBFOLDER = "MeetingTranscript"

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

/**
 * Folder used when the account a meeting was attended from cannot be determined.
 *
 * Only Google Meet exposes the signed-in address, so Teams and Zoom meetings — and any
 * meeting recorded before account detection existed — land here.
 */
export const UNKNOWN_ACCOUNT_FOLDER = "unknown-account"

/**
 * Nests a folder prefix under the account the meeting was attended from, so the vault is
 * always parent / account / note.
 *
 * The account level is always present, including when the address is unknown: a uniform
 * depth means every note sits at the same level, which keeps the folder navigable and
 * makes vault-side tooling — searches, Bases, templates — predictable.
 */
export function withAccountSubfolder(folderPrefix: string, accountEmail: string | undefined): string {
    const account = (accountEmail ?? "").trim()
    // getFolderPrefix treats an empty value as "the root", which would flatten the
    // structure, so the fallback is substituted before sanitising and again after, in
    // case the address sanitises away to nothing.
    const segment = getFolderPrefix(account || UNKNOWN_ACCOUNT_FOLDER, UNKNOWN_ACCOUNT_FOLDER)
    return `${folderPrefix}${segment || `${UNKNOWN_ACCOUNT_FOLDER}/`}`
}

/** Meetings retained when the user has not chosen a limit. */
export const DEFAULT_MEETINGS_TO_KEEP = 10

/** Upper bound offered in the UI; 0 is "keep everything". */
export const MAX_MEETINGS_TO_KEEP = 500
