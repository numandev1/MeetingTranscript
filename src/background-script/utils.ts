import type { ChatMessage, ExtensionMessage, Platform, ResultLocal, ResultSync, TranscriptBlock } from "@lib/types"
import { ALARM_NAME, INTERVAL_IN_MINUTES, TIMEFORMAT } from "./config"
import { getPermissionStatus } from "./platforms"

export function checkAndCreateAlarm(): void {
    chrome.alarms.get(ALARM_NAME, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(ALARM_NAME, {
                periodInMinutes: INTERVAL_IN_MINUTES
            })
            console.log(`Alarm "${ALARM_NAME}" created successfully.`)
        } else {
            console.log(`Alarm "${ALARM_NAME}" already exists. Next scheduled run:`, new Date(alarm.scheduledTime))
        }
    })
}

/** Format transcript entries into string */
export function getTranscriptString(transcript: TranscriptBlock[]): string {
    let transcriptString = ""
    if (transcript.length > 0) {
        transcript.forEach(transcriptBlock => {
            transcriptString += `${transcriptBlock.personName} (${new Date(transcriptBlock.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            transcriptString += transcriptBlock.transcriptText
            transcriptString += "\n\n"
        })
        return transcriptString
    }
    return transcriptString
}

/** Format chat messages into string */
export function getChatMessagesString(chatMessages: ChatMessage[]): string {
    let chatMessagesString = ""
    if (chatMessages.length > 0) {
        chatMessages.forEach(chatMessage => {
            chatMessagesString += `${chatMessage.personName} (${new Date(chatMessage.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            chatMessagesString += chatMessage.chatMessageText
            chatMessagesString += "\n\n"
        })
    }
    return chatMessagesString
}

export function clearTabIdAndApplyUpdate(): void {
    // Nullify to indicate end of meeting processing
    chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting")

        // Check if there's a deferred update
        chrome.storage.local.get(["isDeferredUpdatedAvailable"], function (resultLocalUntyped) {
            const resultLocal = resultLocalUntyped as Partial<ResultLocal>

            if (resultLocal.isDeferredUpdatedAvailable) {
                console.log("Applying deferred update")
                chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, function () {
                    chrome.runtime.reload()
                })
            }
        })
    })
}

/** Opens the extension popup programmatically. */
export function openExtensionPopup(): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.action.openPopup()
            .then(() => {
                console.log("Popup opened successfully")
                resolve("Popup opened")
            })
            .catch((error) => {
                console.error("Failed to open popup:", error)
                reject("Failed to open popup")
            })
    })
}

/** Opens the side panel programmatically for the active tab */
export function openSidePanel(): Promise<string> {
    return new Promise((resolve, reject) => {
        // Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0]
            if (!activeTab || !activeTab.id) {
                console.error("No active tab found.")
                reject("No active tab found")
                return
            }

            // Open the side panel targeting that specific tab ID
            chrome.sidePanel.open({ tabId: activeTab.id })
                .then(() => {
                    console.log("Side panel opened successfully")
                    resolve("Side panel opened")
                })
                .catch((error) => {
                    console.error("Failed to open side panel:", error)
                    reject("Failed to open side panel")
                })
        })
    })
}

export function checkPermissionsAndOpenMeetingsPage(): void {
    console.log("Check permissions")
    chrome.storage.sync.get(["wantGoogleMeet", "wantTeams", "wantZoom"], function (resultSyncUntyped) {
        const resultSync = resultSyncUntyped as Partial<ResultSync>

        const wantedPlatforms: Platform[] = []
        //  Consider enabled if user has not explicitly opted out
        if (resultSync.wantGoogleMeet) {
            wantedPlatforms.push("google_meet")
        }
        if (resultSync.wantTeams) {
            wantedPlatforms.push("teams")
        }
        if (resultSync.wantZoom) {
            wantedPlatforms.push("zoom")
        }

        const message: ExtensionMessage = {
            type: "get_platform_permission_status",
            platform: wantedPlatforms
        }
        void message

        getPermissionStatus(wantedPlatforms).then((result) => {
            console.log(result)

            const permissionMissingPlatforms: Platform[] = []

            for (let i = 0; i < wantedPlatforms.length; i++) {
                if (Array.isArray(result) && result[i] === "Disabled") {
                    permissionMissingPlatforms.push(wantedPlatforms[i])
                }
            }

            if (permissionMissingPlatforms.length > 0) {
                console.log(permissionMissingPlatforms)
                chrome.tabs.create({
                    url: chrome.runtime.getURL("meetings.html")
                })
            }
        })
    })
}

/**
 * Reads the Google account the meeting is being attended from, out of the meeting tab.
 *
 * The address is not in the DOM as its own text node, but Google's page config object
 * carries it. That object is a page global, invisible to a content script's isolated
 * world, so this runs in the MAIN world from the background instead.
 *
 * Values are scanned rather than a fixed key being read, because the key is obfuscated
 * and Google rotates those; an address is only accepted when exactly one distinct
 * candidate is present, so a participant's address can never be mistaken for the user's.
 */
export function captureAccountEmail(tabId: number): void {
    chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
            const emailPattern = /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i
            const pageData = (globalThis as unknown as { WIZ_global_data?: Record<string, unknown> }).WIZ_global_data
            if (!pageData) {
                return undefined
            }
            const candidates = [...new Set(
                Object.values(pageData)
                    .filter((value): value is string => typeof value === "string")
                    .map(value => value.trim())
                    .filter(value => emailPattern.test(value))
            )]
            return candidates.length === 1 ? candidates[0] : undefined
        }
    }).then((results) => {
        const accountEmail = results?.[0]?.result
        if (accountEmail) {
            chrome.storage.local.set({ accountEmail: accountEmail }, function () {
                console.log("Meeting account captured")
            })
        }
    }).catch((error) => {
        // Not fatal: notes simply stay in the top level folder
        console.log("Could not determine the meeting account:", error)
    })
}
