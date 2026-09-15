import type { Meeting } from "./types"

/**
 * Applies the retention limit to the extension's own list of meetings.
 *
 * Deliberately pure and deliberately narrow: it takes meetings and returns meetings.
 * It has no access to the vault, the download folder or the webhook, which is what
 * guarantees that raising or lowering the limit can only ever affect the copy the
 * browser holds. Removing an Obsidian note is a separate, user-initiated action.
 *
 * @param keep 0 keeps everything
 */
export function trimMeetings(meetings: Meeting[], keep: number): Meeting[] {
    if (keep <= 0 || meetings.length <= keep) {
        return [...meetings]
    }
    // Newest are at the end, so the oldest fall off the front
    return meetings.slice(-keep)
}

/** How many meetings applying this limit would drop from the list. */
export function meetingsDroppedBy(meetings: Meeting[], keep: number): number {
    return keep <= 0 ? 0 : Math.max(0, meetings.length - keep)
}
