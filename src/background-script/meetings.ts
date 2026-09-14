import type { ErrorObject, Meeting, ResultLocal, ResultSync } from "@lib/types"
import { downloadTranscript, postTranscriptToWebhook } from "./exporters"

/**
 * Download transcripts, post webhook if URL is enabled and available.
 * Fails if transcript is empty or webhook request fails or if no meetings in storage.
 * @throws error codes: 009, 010, 011, 012, 013, 014
 */
export function processLastMeeting(): Promise<string> {
    return new Promise((resolve, reject) => {
        pickupLastMeetingFromStorage()
            .then(() => {
                chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                    const resultLocal = resultLocalUntyped as Partial<ResultLocal>
                    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"], function (resultSyncUntyped) {
                        const resultSync = resultSyncUntyped as Partial<ResultSync>

                        // pickupLastMeetingFromStorage resolved, so at least one meeting exists
                        const meetings = resultLocal.meetings as Meeting[]

                        // Create an array of promises to execute in parallel
                        const promises: Promise<unknown>[] = []

                        // Meeting index to download and post webhook
                        const lastIndex = meetings.length - 1

                        // Promise to download transcript
                        if (resultSync.autoDownloadFileAfterMeeting) {
                            promises.push(
                                downloadTranscript(lastIndex)
                            )
                        }

                        // Promise to post webhook if enabled
                        if (resultSync.autoPostWebhookAfterMeeting && resultSync.webhookUrl) {
                            promises.push(postTranscriptToWebhook(lastIndex))
                        }

                        // Execute all promises in parallel
                        Promise.all(promises)
                            .then(() => {
                                resolve("Meeting processing and download/webhook posting complete")
                                // Increment anonymous transcript generated count to a Google sheet
                                const meetingSoftware = meetings[lastIndex].meetingSoftware
                                const isWebhookEnabled = resultSync.webhookUrl && resultSync.autoPostWebhookAfterMeeting ? true : false
                                fetch(`https://script.google.com/macros/s/AKfycbxK3Xd3u7ArtSEEUmu4jJSuJiyOHr5BtRqRGbcAy8Yc3zlVBTUoJ4wr-fJtQtlqRLGspg/exec?version=${chrome.runtime.getManifest().version}&isWebhookEnabled=${isWebhookEnabled}&meetingSoftware=${meetingSoftware}`, {
                                    mode: "no-cors"
                                })
                            })
                            .catch(error => {
                                // Fails with error codes: 009, 010, 011, 012
                                const parsedError = error as ErrorObject
                                console.error("Operation failed:", parsedError.errorMessage)
                                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage } satisfies ErrorObject)
                            })
                    })
                })
            })
            .catch((error) => {
                // Fails with error codes: 013, 014
                const parsedError = error as ErrorObject
                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage } satisfies ErrorObject)
            })
    })
}

/**
 * Process transcript and chat messages of the meeting that just ended from storage,
 * format them into strings, and save as a new entry in meetings (keeping last 10).
 * @throws error codes: 013, 014
 */
export function pickupLastMeetingFromStorage(): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([
            "meetingSoftware",
            "meetingTitle",
            "meetingStartTimestamp",
            "transcript",
            "chatMessages",
        ], function (resultUntyped) {
            const result = resultUntyped as Partial<ResultLocal>

            if (result.meetingStartTimestamp) {
                const transcript = result.transcript ?? []
                const chatMessages = result.chatMessages ?? []

                if ((transcript.length > 0) || (chatMessages.length > 0)) {
                    // Create new transcript entry
                    const newMeetingEntry: Meeting = {
                        meetingSoftware: result.meetingSoftware ? result.meetingSoftware : "",
                        meetingTitle: result.meetingTitle,
                        meetingStartTimestamp: result.meetingStartTimestamp,
                        meetingEndTimestamp: new Date().toISOString(),
                        transcript: transcript,
                        chatMessages: chatMessages,
                        webhookPostStatus: "new"
                    }

                    // Get existing recent meetings and add the new meeting
                    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                        const resultLocal = resultLocalUntyped as Partial<ResultLocal>
                        let meetings = resultLocal.meetings || []
                        meetings.push(newMeetingEntry)

                        // Keep only last 10 transcripts
                        if (meetings.length > 10) {
                            meetings = meetings.slice(-10)
                        }

                        // Save updated recent transcripts
                        chrome.storage.local.set({ meetings: meetings }, function () {
                            console.log("Last meeting picked up")
                            resolve("Last meeting picked up")
                        })
                    })
                }
                else {
                    reject({ errorCode: "014", errorMessage: "Empty transcript and empty chatMessages" } satisfies ErrorObject)
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" } satisfies ErrorObject)
            }
        })
    })
}

/** @throws error codes: 009, 010, 011, 012, 013, 014 */
export function recoverLastMeeting(): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings", "meetingStartTimestamp"], function (resultLocalUntyped) {
            const resultLocal = resultLocalUntyped as Partial<ResultLocal>
            // Check if user ever attended a meeting
            if (resultLocal.meetingStartTimestamp) {
                let lastSavedMeeting: Meeting | undefined
                if ((resultLocal.meetings) && (resultLocal.meetings.length > 0)) {
                    lastSavedMeeting = resultLocal.meetings[resultLocal.meetings.length - 1]
                }

                // Last meeting was not processed for some reason. Need to recover that data, process and download it.
                if ((!lastSavedMeeting) || (resultLocal.meetingStartTimestamp !== lastSavedMeeting.meetingStartTimestamp)) {
                    processLastMeeting().then(() => {
                        resolve("Recovered last meeting to the best possible extent")
                    }).catch((error) => {
                        // Fails with error codes: 009, 010, 011, 013, 014
                        const parsedError = error as ErrorObject
                        reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage } satisfies ErrorObject)
                    })
                }
                else {
                    resolve("No recovery needed")
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" } satisfies ErrorObject)
            }
        })
    })
}
