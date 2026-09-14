import type { ErrorObject, ExtensionMessage, ExtensionResponse, Platform, ResultLocal, ResultSync } from "@lib/types"
import { ALARM_NAME } from "./config"
import { processLastMeeting, recoverLastMeeting } from "./meetings"
import { downloadTranscript, postTranscriptToWebhook } from "./exporters"
import {
    getPermissionStatus,
    requestPlatformPermission,
    getContentScriptStatus,
    registerContentScript,
    deregisterContentScript,
    reRegisterContentScripts,
    registerZoomRedirect,
    deregisterZoomRedirect,
} from "./platforms"
import {
    clearTabIdAndApplyUpdate,
    openExtensionPopup,
    checkAndCreateAlarm,
    openSidePanel
} from "./utils"

chrome.runtime.onMessage.addListener(function (messageUnTyped, sender, sendResponse) {
    const message = messageUnTyped as ExtensionMessage
    console.log(message.type)

    if (message.type === "new_meeting_started") {
        // Saving current tab id, to download transcript when this tab is closed
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0].id
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        })
    }

    if (message.type === "meeting_ended") {
        // Prevents double downloading of transcript from tab closed event listener. Also prevents available update from being applied, during meeting post processing.
        chrome.storage.local.set({ meetingTabId: "processing" }, function () {
            console.log("Meeting tab id set to processing meeting")

            processLastMeeting()
                .then(() => {
                    const response: ExtensionResponse = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010, 011, 012, 013, 014
                    const parsedError = error as ErrorObject

                    const response: ExtensionResponse = { success: false, message: parsedError }
                    sendResponse(response)
                })
                .finally(() => {
                    // setTimeout(() => {
                    //     checkPermissionsAndOpenMeetingsPage()
                    // }, 10000)
                    clearTabIdAndApplyUpdate()
                })
        })
    }

    if (message.type === "download_transcript_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Download the requested item
            downloadTranscript(message.index, false)
                .then(() => {
                    const response: ExtensionResponse = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010
                    const parsedError = error as ErrorObject

                    const response: ExtensionResponse = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            const response: ExtensionResponse = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "post_webhook_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Handle webhook retry
            postTranscriptToWebhook(message.index)
                .then(() => {
                    const response: ExtensionResponse = { success: true }
                    sendResponse(response)
                })
                .catch(error => {
                    // Fails with error codes: 009, 010, 011, 012
                    const parsedError = error as ErrorObject

                    console.error("Webhook retry failed:", parsedError)
                    const response: ExtensionResponse = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            const response: ExtensionResponse = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "recover_last_meeting") {
        recoverLastMeeting().then((resolvedMessage) => {
            const response: ExtensionResponse = { success: true, message: resolvedMessage }
            sendResponse(response)
        })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = error as ErrorObject

                const response: ExtensionResponse = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "get_platform_enablement_status") {
        const platform: Platform | Platform[] = message.platform || "google_meet"

        getContentScriptStatus(platform)
            .then((status) => {
                const response: ExtensionResponse = {
                    success: true,
                    message: status
                }
                sendResponse(response)
            })
            .catch((error) => {
                const parsedError = error as ErrorObject
                const response: ExtensionResponse = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "get_platform_permission_status") {
        const platform: Platform | Platform[] = message.platform || "google_meet"

        getPermissionStatus(platform)
            .then((status) => {
                const response: ExtensionResponse = {
                    success: true,
                    message: status
                }
                sendResponse(response)
            })
            .catch((error) => {
                const parsedError = error as ErrorObject
                const response: ExtensionResponse = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if ((message.type === "enable_platform")) {
        const platform: Platform | Platform[] = message.platform || "google_meet"

        requestPlatformPermission(platform).then(() => {
            // After permissions are granted, register both the scripts and the redirect rule for zoom
            const promises: Promise<string | string[]>[] = [registerContentScript(platform)]

            const platformsArray = Array.isArray(platform) ? platform : [platform]
            const hasZoom = platformsArray.includes("zoom")

            if (hasZoom) {
                promises.push(registerZoomRedirect())
            }

            Promise.all(promises).then((results) => {
                const response: ExtensionResponse = { success: true, message: results[0] }
                sendResponse(response)
            }).catch((error) => {
                // Fails with error codes: not defined
                const parsedError = error as ErrorObject

                const response: ExtensionResponse = { success: false, message: parsedError }
                sendResponse(response)
            })
        })
            .catch((error) => {
                // Fails with error codes: not defined
                const parsedError = error as ErrorObject

                const response: ExtensionResponse = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "disable_platform") {
        const platform: Platform | Platform[] = message.platform || "google_meet"

        // To disable, we simply unregister the content scripts and any redirect rules
        const promises: Promise<string | string[]>[] = [deregisterContentScript(platform)]

        const platformsArray = Array.isArray(platform) ? platform : [platform]
        const hasZoom = platformsArray.includes("zoom")

        if (hasZoom) {
            promises.push(deregisterZoomRedirect())
        }

        Promise.all(promises).then((results) => {
            const response: ExtensionResponse = { success: true, message: results[0] }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = error as ErrorObject

            const response: ExtensionResponse = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    if (message.type === "open_popup") {
        openExtensionPopup().then((resolvedMessage) => {
            const response: ExtensionResponse = { success: true, message: resolvedMessage }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = error as ErrorObject

            const response: ExtensionResponse = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    if (message.type === "open_side_panel") {
        openSidePanel().then((resolvedMessage) => {
            const response: ExtensionResponse = { success: true, message: resolvedMessage }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = error as ErrorObject

            const response: ExtensionResponse = { success: false, message: parsedError }
            sendResponse(response)
        })
    }


    return true
})

// Download last meeting if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    chrome.storage.local.get(["meetingTabId"], function (resultLocalUntyped) {
        const resultLocal = resultLocalUntyped as Partial<ResultLocal>

        if (tabId === resultLocal.meetingTabId) {
            console.log("Successfully intercepted tab close")

            // Prevent misfires of onRemoved until next meeting. Also prevents available update from being applied, during meeting post processing.
            chrome.storage.local.set({ meetingTabId: "processing" }, function () {
                console.log("Meeting tab id set to processing meeting")

                processLastMeeting().finally(() => {
                    // setTimeout(() => {
                    //     checkPermissionsAndOpenMeetingsPage()
                    // }, 10000)
                    clearTabIdAndApplyUpdate()
                })
            })
        }
    })
})

// Listen for extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
    // Check if there is an active meeting
    chrome.storage.local.get(["meetingTabId"], function (resultUntyped) {
        const result = resultUntyped as Partial<ResultLocal>

        if (result.meetingTabId) {
            // There is an active meeting(values: tabId or processing), defer the update
            chrome.storage.local.set({ isDeferredUpdatedAvailable: true }, function () {
                console.log("Deferred update flag set")
            })
        } else {
            // No active meeting, apply the update immediately. Meeting tab id is nullified only post meeting operations are done, so no race conditions.
            console.log("No active meeting, applying update immediately")
            chrome.runtime.reload()
        }
    })
})

// Register content scripts and Zoom redirect whenever runtime permission change—mostly serves as a backup for changes made outside the UI.
chrome.permissions.onAdded.addListener(() => {
    // Prevent competing with explicit content script registrations
    setTimeout(() => {
        const platforms: Platform[] = ["google_meet", "teams", "zoom"]
        const deRegisterPromises: Promise<unknown>[] = [deregisterContentScript(platforms), deregisterZoomRedirect()]

        Promise.all(deRegisterPromises)
            .then(() => {
                console.log("De-registered all content scripts. Starting re-registration...")

            })

        reRegisterContentScripts()
    }, 2000)
})


chrome.runtime.onInstalled.addListener(() => {
    // Set defaults values
    chrome.storage.sync.get(null, function (resultSyncUntyped) {
        const resultSync = resultSyncUntyped as Partial<ResultSync>

        console.log(resultSync.wantTeams)

        chrome.storage.sync.set({
            autoPostWebhookAfterMeeting: resultSync.autoPostWebhookAfterMeeting === false ? false : true,
            autoDownloadFileAfterMeeting: resultSync.autoDownloadFileAfterMeeting === false ? false : true,
            operationMode: resultSync.operationMode === "manual" ? "manual" : "auto",
            hideCaptions: resultSync.hideCaptions === true ? true : false,
            webhookBodyType: resultSync.webhookBodyType === "advanced" ? "advanced" : "simple",
            wantGoogleMeet: resultSync.wantGoogleMeet === false ? false : true,
            wantTeams: resultSync.wantTeams === true ? true : false,
            wantZoom: resultSync.wantZoom === true ? true : false
        }, function () {
            // Re-register content scripts whenever extension is installed or updated, provided permissions are available. Suppress notification for silent background operation.
            reRegisterContentScripts()
        })

        checkAndCreateAlarm()
    })
})

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log("Alarm triggered: Running daily check...")
        // checkPermissionsAndOpenMeetingsPage()
    }
})
