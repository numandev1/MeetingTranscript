import type { ErrorObject, ResultLocal, ResultSync, WebhookBody } from "@lib/types"
import { getTranscriptString, getChatMessagesString } from "./utils"
import { TIMEFORMAT } from "./config"

/** @throws error codes: 009, 010 */
export function downloadTranscript(index: number, isWebhookEnabled?: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = resultLocalUntyped as Partial<ResultLocal>

            if (resultLocal.meetings && resultLocal.meetings[index]) {
                const meeting = resultLocal.meetings[index]

                // Sanitise meeting title to prevent invalid file name errors
                // https://stackoverflow.com/a/78675894
                const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
                let sanitisedMeetingTitle = "Meeting"
                if (meeting.meetingTitle) {
                    sanitisedMeetingTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
                }
                else if (meeting.title) {
                    sanitisedMeetingTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
                }

                // Format timestamp for human-readable filename and sanitise to prevent invalid filenames
                const timestamp = new Date(meeting.meetingStartTimestamp)
                const formattedTimestamp = timestamp.toLocaleString("default", TIMEFORMAT).replace(/[\/:]/g, "-")

                const prefix = meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"

                const fileName = `TranscripTonic/${prefix}-${sanitisedMeetingTitle} at ${formattedTimestamp} on.txt`


                // Format transcript and chatMessages content
                let content = getTranscriptString(meeting.transcript)
                content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
                content += getChatMessagesString(meeting.chatMessages)

                const blob = new Blob([content], { type: "text/plain" })

                // Read the blob as a data URL
                const reader = new FileReader()

                // Read the blob
                reader.readAsDataURL(blob)

                // Download as text file, once blob is read
                reader.onload = function (event) {
                    if (event.target?.result) {
                        const dataUrl = event.target.result as string

                        // Create a download with Chrome Download API
                        chrome.downloads.download({
                            url: dataUrl,
                            filename: fileName,
                            conflictAction: "uniquify"
                        }).then(() => {
                            console.log("Transcript downloaded")
                            resolve("Transcript downloaded successfully")
                        }).catch((err) => {
                            console.error(err)
                            chrome.downloads.download({
                                url: dataUrl,
                                filename: "TranscripTonic/Transcript.txt",
                                conflictAction: "uniquify"
                            })
                            console.log("Invalid file name. Transcript downloaded to TranscripTonic directory with simple file name.")
                            resolve("Transcript downloaded successfully with default file name")

                            // Logs anonymous errors to a Google sheet for swift debugging
                            fetch(`https://script.google.com/macros/s/AKfycbz0VFUYIke1WK12Q-8y-zQ91bOPRZ8dAL4cRpm309IYZO0k6uYDkTSlfbWFaGvUV_Z-JQ/exec?version=${chrome.runtime.getManifest().version}&code=009&error=${encodeURIComponent(err)}&meetingSoftware=${meeting.meetingSoftware}`, { mode: "no-cors" })
                        })
                    }
                    else {
                        const error: ErrorObject = { errorCode: "009", errorMessage: "Failed to read blob" }
                        reject(error)
                    }
                }
            }
            else {
                const error: ErrorObject = { errorCode: "010", errorMessage: "Meeting at specified index not found" }
                reject(error)
            }
        })
    })
}

/** @throws error codes: 010, 011, 012 */
export function postTranscriptToWebhook(index: number): Promise<string> {
    return new Promise((resolve, reject) => {
        // Get webhook URL and meetings
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = resultLocalUntyped as Partial<ResultLocal>
            chrome.storage.sync.get(["webhookUrl", "webhookBodyType"], function (resultSyncUntyped) {
                const resultSync = resultSyncUntyped as Partial<ResultSync>

                if (resultSync.webhookUrl) {
                    const meetings = resultLocal.meetings
                    if (meetings && meetings[index]) {
                        const meeting = meetings[index]

                        let webhookData: WebhookBody
                        if (resultSync.webhookBodyType === "advanced") {
                            webhookData = {
                                webhookBodyType: "advanced",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
                                transcript: meeting.transcript,
                                chatMessages: meeting.chatMessages
                            }
                        }
                        else {
                            webhookData = {
                                webhookBodyType: "simple",
                                meetingSoftware: meeting.meetingSoftware ? meeting.meetingSoftware : "",
                                meetingTitle: meeting.meetingTitle || meeting.title || "",
                                meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", TIMEFORMAT).toUpperCase(),
                                meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", TIMEFORMAT).toUpperCase(),
                                transcript: getTranscriptString(meeting.transcript),
                                chatMessages: getChatMessagesString(meeting.chatMessages)
                            }
                        }

                        // Post to webhook
                        fetch(resultSync.webhookUrl, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(webhookData)
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error(`Webhook request failed with HTTP status code ${response.status} ${response.statusText}`)
                            }
                        }).then(() => {
                            // Update success status.
                            meetings[index].webhookPostStatus = "successful"
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                resolve("Webhook posted successfully")
                            })
                        }).catch(error => {
                            console.error(error)
                            // Update failure status.
                            meetings[index].webhookPostStatus = "failed"
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                // Create notification and open webhooks page
                                chrome.notifications.create({
                                    type: "basic",
                                    iconUrl: "icon.png",
                                    title: "Could not post webhook!",
                                    message: "Click to view status and retry. Check console for more details."
                                }, function (notificationId) {
                                    // Handle notification click
                                    chrome.notifications.onClicked.addListener(function (clickedNotificationId) {
                                        if (clickedNotificationId === notificationId) {
                                            chrome.tabs.create({ url: "meetings.html" })
                                        }
                                    })
                                })
                                const parsedError: ErrorObject = { errorCode: "011", errorMessage: error instanceof Error ? error.message : String(error) }
                                reject(parsedError)
                            })
                        })
                    }
                    else {
                        const error: ErrorObject = { errorCode: "010", errorMessage: "Meeting at specified index not found" }
                        reject(error)
                    }
                }
                else {
                    const error: ErrorObject = { errorCode: "012", errorMessage: "No webhook URL configured" }
                    reject(error)
                }
            })
        })
    })
}
