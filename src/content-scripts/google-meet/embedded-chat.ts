import type { EmbeddedChatMessage, ExtensionMessage, ExtensionResponse } from "@lib/types"
import { SELECTORS_GOOGLE_MEET_EMBEDDED_CHAT as SELECTORS } from "./config"

const MEET_ORIGIN = "https://meet.google.com"
const SWEEP_DEBOUNCE_MS = 500
// Safety net for anything a mutation burst hides (virtualised list, edits)
const SWEEP_INTERVAL_MS = 5000

/**
 * True only for the Google Chat iframe that Meet embeds for in-call chat. The script is
 * injected into every chat.google.com frame, so everything else (the Chat app itself,
 * Gmail's chat pane) must be left alone.
 */
function isMeetEmbeddedChatFrame(): boolean {
    if (window === window.top) {
        return false
    }
    const ancestorOrigins = location.ancestorOrigins
    if (ancestorOrigins && ancestorOrigins.length > 0) {
        return ancestorOrigins[ancestorOrigins.length - 1] === MEET_ORIGIN
    }
    return new URLSearchParams(location.search).get("origin") === MEET_ORIGIN
}

/** Reads every rendered message; a run from one sender only names them on its first message. */
function readMessages(): EmbeddedChatMessage[] {
    const messages: EmbeddedChatMessage[] = []
    let lastSender = ""
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.MESSAGE))) {
        const messageId = element.getAttribute("data-id")
        const sender = element.querySelector(SELECTORS.SENDER)?.getAttribute("data-name")?.trim()
        if (sender) {
            lastSender = sender
        }
        const body = element.querySelector<HTMLElement>(SELECTORS.BODY)?.innerText?.trim()
        if (!messageId || !body) {
            continue
        }
        const sentAtMs = Number(element.querySelector(SELECTORS.TIMESTAMP)?.getAttribute("data-absolute-timestamp"))
        messages.push({
            messageId,
            personName: lastSender || "Unknown",
            timestamp: new Date(Number.isFinite(sentAtMs) && sentAtMs > 0 ? sentAtMs : Date.now()).toISOString(),
            chatMessageText: body
        })
    }
    return messages
}

export function initGoogleMeetEmbeddedChat(): void {
    if (!isMeetEmbeddedChatFrame()) {
        return
    }

    const sentIds = new Set<string>()
    let sweepTimer: ReturnType<typeof setTimeout> | undefined

    function sweep(): void {
        sweepTimer = undefined
        const fresh = readMessages().filter(m => !sentIds.has(m.messageId))
        if (fresh.length === 0) {
            return
        }
        const message: ExtensionMessage = { type: "meet_embedded_chat_messages", embeddedChatMessages: fresh }
        chrome.runtime.sendMessage(message)
            // Only mark as sent once the meeting frame accepted them, so a sleeping worker
            // or a not-yet-ready Meet script cannot drop a batch; the next sweep retries.
            .then((response: ExtensionResponse | undefined) => {
                if (response?.success) {
                    fresh.forEach(m => sentIds.add(m.messageId))
                }
            })
            .catch(err => console.error("MeetingTranscript: could not relay chat messages", err))
    }

    function scheduleSweep(): void {
        if (sweepTimer === undefined) {
            sweepTimer = setTimeout(sweep, SWEEP_DEBOUNCE_MS)
        }
    }

    new MutationObserver(scheduleSweep).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    })
    setInterval(scheduleSweep, SWEEP_INTERVAL_MS)
    scheduleSweep()
}
