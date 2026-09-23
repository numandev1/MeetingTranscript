import type { ChatMessage, Meeting, TranscriptBlock } from "./types"

/**
 * How long after one piece of a meeting ends that another piece of the same meeting
 * still counts as the user coming back, rather than as a new meeting.
 */
export const REJOIN_WINDOW_MS = 10 * 60 * 1000

/**
 * Below this many words a meeting is not summarised automatically. A reload or a
 * rejoin files the few seconds before it as a meeting of its own, and summarising
 * that opened ChatGPT in the middle of the call to produce a one-line summary.
 * The Summarise button still works on any meeting.
 */
export const MIN_WORDS_TO_AUTO_SUMMARIZE = 50

/** Titles Meet shows before the real meeting name has loaded. */
const GENERIC_TITLES = ["", "google meet", "meet"]

/**
 * The meeting's address, without the query string, so "?authuser=1" or "?pli=1" on a
 * rejoin does not make the same meeting look like a different one.
 */
export function normaliseMeetingUrl(url: string | undefined): string | undefined {
    if (!url) {
        return undefined
    }
    try {
        const parsed = new URL(url)
        return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "")
    }
    catch {
        return undefined
    }
}

/**
 * Whether `next` is the same meeting as `previous`, resumed after the page reloaded or
 * the user left and rejoined.
 *
 * Google Meet only, because only Meet has an address that identifies one meeting: a
 * Teams or Zoom web client address can be shared by consecutive, unrelated meetings,
 * and merging those would be far worse than a meeting split in two.
 */
export function isRejoinOf(previous: Meeting | undefined, next: Meeting): boolean {
    if (!previous) {
        return false
    }
    if (previous.meetingSoftware !== "Google Meet" || next.meetingSoftware !== "Google Meet") {
        return false
    }
    if (!previous.meetingUrl || previous.meetingUrl !== next.meetingUrl) {
        return false
    }
    if (previous.accountEmail && next.accountEmail && previous.accountEmail !== next.accountEmail) {
        return false
    }

    const gap = new Date(next.meetingStartTimestamp).getTime() - new Date(previous.meetingEndTimestamp).getTime()
    // A little negative slack: the earlier piece's end is stamped when it is filed,
    // which can be a moment after the next piece started.
    return Number.isFinite(gap) && gap >= -60 * 1000 && gap <= REJOIN_WINDOW_MS
}

function normaliseText(text: string): string {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/**
 * Joins the two transcripts, dropping the earlier piece's last block when the later
 * piece opens with the same speaker saying the same thing. Meet shows the caption in
 * progress again after a rejoin, so without this the sentence appears twice, once cut
 * off.
 */
function joinTranscripts(first: TranscriptBlock[], second: TranscriptBlock[]): TranscriptBlock[] {
    const last = first[first.length - 1]
    const next = second[0]
    if (last && next
        && last.personName === next.personName
        && normaliseText(next.transcriptText).startsWith(normaliseText(last.transcriptText))) {
        return [...first.slice(0, -1), ...second]
    }
    return [...first, ...second]
}

function joinChatMessages(first: ChatMessage[], second: ChatMessage[]): ChatMessage[] {
    const key = (message: ChatMessage) => `${message.personName}\u0000${message.chatMessageText}`
    const seen = new Set(first.map(key))
    return [...first, ...second.filter(message => !seen.has(key(message)))]
}

function isGenericTitle(title: string | undefined): boolean {
    return GENERIC_TITLES.includes((title ?? "").trim().toLowerCase())
}

/**
 * One meeting out of two pieces of it.
 *
 * It keeps the earlier piece's start time, so the Obsidian note and the file names
 * stay the same and the note is overwritten rather than duplicated. Every delivery is
 * reset to "new" and the earlier summary is dropped: it described only the first
 * piece, and left in place it would read as the summary of the whole meeting.
 */
export function mergeRejoin(previous: Meeting, next: Meeting): Meeting {
    return {
        ...previous,
        meetingTitle: isGenericTitle(previous.meetingTitle) ? next.meetingTitle : previous.meetingTitle,
        meetingEndTimestamp: next.meetingEndTimestamp,
        accountEmail: previous.accountEmail ?? next.accountEmail,
        captionsSeen: previous.captionsSeen === true || next.captionsSeen === true,
        transcript: joinTranscripts(previous.transcript, next.transcript),
        chatMessages: joinChatMessages(previous.chatMessages, next.chatMessages),
        mergedStartTimestamps: [...(previous.mergedStartTimestamps ?? []), next.meetingStartTimestamp],
        webhookPostStatus: "new",
        obsidianPostStatus: "new",
        summary: undefined,
        summaryStatus: undefined,
    }
}

/**
 * Whether this saved meeting already holds the piece that started at `startTimestamp`.
 * Recovery relies on it: a merged meeting keeps its first piece's start time, so the
 * later piece would otherwise look like one that was never filed, and be filed again.
 */
export function coversStartTimestamp(meeting: Meeting | undefined, startTimestamp: string): boolean {
    if (!meeting) {
        return false
    }
    return meeting.meetingStartTimestamp === startTimestamp
        || (meeting.mergedStartTimestamps ?? []).includes(startTimestamp)
}

/** Whether enough was said in a meeting for it to be worth summarising automatically. */
export function hasEnoughToSummarize(meeting: Meeting): boolean {
    const words = meeting.transcript
        .map(block => block.transcriptText)
        .concat(meeting.chatMessages.map(message => message.chatMessageText))
        .join(" ")
        .split(/\s+/)
        .filter(word => word.length > 0)
    return words.length >= MIN_WORDS_TO_AUTO_SUMMARIZE
}
