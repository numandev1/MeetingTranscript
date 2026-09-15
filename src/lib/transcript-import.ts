import type { ChatMessage, Meeting, MeetingSoftware, TranscriptBlock } from "./types"

/** Divider the exporter writes between the transcript and the chat log. */
const CHAT_DIVIDER = /\n-{5,}\s*\nCHAT MESSAGES\s*\n-{5,}\s*\n/

/** "Priya (15/09/2026, 01:05 PM)" — the header the exporter writes above each block. */
const BLOCK_HEADER = /^(.+?)\s+\((\d{1,2})[/-](\d{1,2})[/-](\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\)\s*$/

/** "<Software> transcript-<Title> at <15-09-2026, 01-05 pm> on.txt" */
const EXPORT_FILE_NAME = /^(?:(.+?)\s+transcript-)?(.*?)(?:\s+at\s+(\d{1,2})-(\d{1,2})-(\d{4}),?\s+(\d{1,2})-(\d{2})\s*([APap][Mm])?)?(?:\s+on)?\.txt$/

function toIso(day: number, month: number, year: number, hour: number, minute: number, second: number, meridiem?: string): string | undefined {
    let hours = hour
    if (meridiem) {
        const isPm = meridiem.toLowerCase() === "pm"
        if (isPm && hours < 12) hours += 12
        if (!isPm && hours === 12) hours = 0
    }

    // The exporter writes whatever order the browser's locale uses. Day-first is assumed
    // because that is what it produced here, and a value above 12 in the first position
    // proves the order outright. Block times are display-only, and the meeting's own
    // start time comes from the file name, so a locale mismatch costs ordering at worst.
    let d = day
    let m = month
    if (month > 12 && day <= 12) {
        d = month
        m = day
    }

    const date = new Date(year, m - 1, d, hours, minute, second)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export interface ParsedFileName {
    meetingSoftware: MeetingSoftware
    meetingTitle: string
    startedAt?: string
}

export function parseTranscriptFileName(fileName: string): ParsedFileName {
    // Chrome appends " (1)", " (2)" ... whenever a download name already exists, which
    // would otherwise leave the whole timestamp stranded in the meeting title.
    const deduplicated = fileName.replace(/\s+\(\d+\)(\.txt)$/i, "$1")
    const match = deduplicated.match(EXPORT_FILE_NAME)
    if (!match) {
        return { meetingSoftware: "", meetingTitle: deduplicated.replace(/\.txt$/i, "") || "Imported transcript" }
    }

    const [, software, title, day, month, year, hour, minute, meridiem] = match
    const startedAt = day
        ? toIso(Number(day), Number(month), Number(year), Number(hour), Number(minute), 0, meridiem)
        : undefined

    return {
        meetingSoftware: (software ?? "") as MeetingSoftware,
        meetingTitle: (title || "").trim() || "Imported transcript",
        startedAt
    }
}

interface RawBlock {
    personName: string
    timestamp?: string
    text: string
}

/** Splits one section into speaker blocks. Text with no headers becomes a single block. */
function parseSection(section: string): RawBlock[] {
    const lines = section.split("\n")
    const blocks: RawBlock[] = []
    let current: RawBlock | undefined
    const looseLines: string[] = []

    for (const line of lines) {
        const header = line.match(BLOCK_HEADER)
        if (header) {
            if (current) blocks.push(current)
            const [, personName, day, month, year, hour, minute, second, meridiem] = header
            current = {
                personName: personName.trim(),
                timestamp: toIso(Number(day), Number(month), Number(year), Number(hour), Number(minute), Number(second ?? 0), meridiem),
                text: ""
            }
            continue
        }

        if (current) {
            current.text += (current.text ? "\n" : "") + line
        }
        else if (line.trim()) {
            looseLines.push(line)
        }
    }
    if (current) blocks.push(current)

    // A file with no recognisable headers is still worth importing, as one block
    if (blocks.length === 0 && looseLines.length > 0) {
        return [{ personName: "Unknown", text: looseLines.join("\n") }]
    }

    return blocks
        .map(block => ({ ...block, text: block.text.trim() }))
        .filter(block => block.text.length > 0)
}

/**
 * Turns an exported transcript file back into a meeting.
 *
 * Deliberately forgiving: the file may have been hand-edited, produced by an older
 * version, or come from somewhere else entirely, so anything unrecognisable still
 * imports as a single block rather than being rejected.
 *
 * @throws when the file has no usable content at all
 */
export function parseTranscriptFile(fileName: string, content: string): Meeting {
    const { meetingSoftware, meetingTitle, startedAt } = parseTranscriptFileName(fileName)

    const [transcriptSection, chatSection] = content.split(CHAT_DIVIDER)
    const transcriptBlocks = parseSection(transcriptSection ?? "")
    const chatBlocks = chatSection ? parseSection(chatSection) : []

    if (transcriptBlocks.length === 0 && chatBlocks.length === 0) {
        throw new Error("That file has no transcript in it.")
    }

    const fallbackStart = startedAt
        ?? transcriptBlocks.find(block => block.timestamp)?.timestamp
        ?? new Date().toISOString()

    const transcript: TranscriptBlock[] = transcriptBlocks.map(block => ({
        personName: block.personName,
        timestamp: block.timestamp ?? fallbackStart,
        transcriptText: block.text
    }))

    const chatMessages: ChatMessage[] = chatBlocks.map(block => ({
        personName: block.personName,
        timestamp: block.timestamp ?? fallbackStart,
        chatMessageText: block.text
    }))

    // Last timestamp seen is the closest thing the file has to an end time
    const lastTimestamp = [...transcript, ...chatMessages]
        .map(entry => entry.timestamp)
        .sort()
        .pop() ?? fallbackStart

    return {
        meetingSoftware,
        meetingTitle,
        meetingStartTimestamp: fallbackStart,
        meetingEndTimestamp: lastTimestamp,
        transcript,
        chatMessages,
        webhookPostStatus: "new",
        obsidianPostStatus: "new"
    }
}
