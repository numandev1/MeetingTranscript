import type { ErrorObject, ExtensionMessage, ExtensionResponse, Meeting, Platform, ResultLocal, ResultSync } from "@lib/types"
import { DEFAULT_DOWNLOAD_SUBFOLDER, DEFAULT_OBSIDIAN_FOLDER, DEFAULT_OBSIDIAN_SUMMARY_FOLDER, getFolderPrefix } from "@lib/paths"
import { DEFAULT_OBSIDIAN_BASE_URL } from "../../background-script/obsidian"

let isMeetingsTableExpanded = false

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const autoDownloadCheckbox = document.querySelector("#auto-download-file")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")
    const showAllButton = document.querySelector("#show-all")
    const downloadFolderForm = document.querySelector("#download-folder-form")
    const downloadFolderInput = document.querySelector("#download-folder")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    chrome.storage.onChanged.addListener(() => {
        loadMeetings()
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            const message: ExtensionMessage = {
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = responseUntyped as ExtensionResponse
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Last meeting recovered successfully!")
                    }
                }
                else {
                    const parsedError = response.message as ErrorObject
                    if (parsedError.errorCode === "013") {
                        alert(parsedError.errorMessage)
                    }
                    else if (parsedError.errorCode === "014") {
                        alert("Nothing to recover—you're on top of the world!")
                    }
                    else {
                        alert("Could not recover last meeting!")
                        console.error(parsedError.errorMessage)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = resultSyncUntyped as Partial<ResultSync>

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }

            // Set checkbox state
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting === true
            if (autoDownloadCheckbox instanceof HTMLInputElement) {
                autoDownloadCheckbox.checked = resultSync.autoDownloadFileAfterMeeting !== false
            }
            updateAutoDownloadCheckBox()

            // Set radio button state
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl === "") {
                // Save webhook URL and settings
                chrome.storage.sync.set({
                    webhookUrl: webhookUrl
                }, function () {
                    alert("Webhook URL saved!")
                })
            }
            else if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl
                    }, function () {
                        alert("Webhook URL saved!")
                    })
                }).catch((error) => {
                    alert("Fine! No webhooks for you!")
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () {
                updateAutoDownloadCheckBox()
            })
        })

        if (autoDownloadCheckbox instanceof HTMLInputElement) {
            autoDownloadCheckbox.addEventListener("change", function () {
                if (!autoDownloadCheckbox.checked) {
                    if (!confirm("Text file serves as a harmless backup, you sure you don't need it?")) {
                        autoDownloadCheckbox.checked = true
                        return
                    }
                }
                chrome.storage.sync.set({
                    autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked,
                }, function () { })
            })
        }

        function updateAutoDownloadCheckBox() {
            if (autoDownloadCheckbox?.parentElement instanceof HTMLDivElement && autoPostCheckbox instanceof HTMLInputElement) {
                autoDownloadCheckbox.parentElement.style.display = autoPostCheckbox.checked ? "flex" : "none"
                if (!autoPostCheckbox.checked && autoDownloadCheckbox instanceof HTMLInputElement) {
                    autoDownloadCheckbox.checked = true
                    chrome.storage.sync.set({
                        autoDownloadFileAfterMeeting: true,
                    }, function () { })
                }
            }
        }

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }

    if (downloadFolderForm instanceof HTMLFormElement && downloadFolderInput instanceof HTMLInputElement) {
        chrome.storage.sync.get(["downloadSubfolder"], function (resultSyncUntyped) {
            const resultSync = resultSyncUntyped as Partial<ResultSync>
            // An empty string is a real setting ("save into Downloads"), so only fall
            // back to the default when nothing has ever been stored.
            downloadFolderInput.value = typeof resultSync.downloadSubfolder === "string"
                ? resultSync.downloadSubfolder
                : DEFAULT_DOWNLOAD_SUBFOLDER
        })

        downloadFolderForm.addEventListener("submit", function (e) {
            e.preventDefault()
            // Store the cleaned value so the input always shows what will actually be used
            const downloadSubfolder = getFolderPrefix(downloadFolderInput.value, DEFAULT_DOWNLOAD_SUBFOLDER).replace(/\/$/, "")
            chrome.storage.sync.set({ downloadSubfolder: downloadSubfolder }, function () {
                downloadFolderInput.value = downloadSubfolder
                alert(downloadSubfolder
                    ? `Transcripts will be saved to Downloads/${downloadSubfolder}/`
                    : "Transcripts will be saved straight into Downloads")
            })
        })
    }

    setupParticipantNameSetting()
    setupObsidianSettings()

    if (showAllButton instanceof HTMLButtonElement) {
        showAllButton.addEventListener("click", () => {
            const meetingsTableContainer = document.querySelector("#meetings-table-container")
            meetingsTableContainer?.classList.remove("fade-mask")
            showAllButton.setAttribute("style", "display:none;")
            isMeetingsTableExpanded = true
        })
    }

    // handlePermissions()
})


/** Request runtime permission for webhook URL */
function requestWebhookAndNotificationPermission(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // Request both host and notifications permissions
            chrome.permissions.request({
                origins: [originPattern],
                permissions: ["notifications"]
            }).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

/**
 * Shows a meeting's transcript and chat in a dialog, so it can be read without
 * downloading the text file first.
 *
 * Everything from the meeting is written with textContent rather than innerHTML:
 * transcript text is captured verbatim from the meeting UI and must never be parsed
 * as markup here.
 */
function openTranscriptDialog(meeting: Meeting, index: number): void {
    const dialog = document.querySelector<HTMLDialogElement>("#transcript-dialog")
    const titleElement = document.querySelector<HTMLElement>("#transcript-dialog-title")
    const metaElement = document.querySelector<HTMLElement>("#transcript-dialog-meta")
    const bodyElement = document.querySelector<HTMLElement>("#transcript-dialog-body")
    const closeButton = document.querySelector<HTMLButtonElement>("#transcript-dialog-close")
    const copyButton = document.querySelector<HTMLButtonElement>("#transcript-dialog-copy")
    const downloadButton = document.querySelector<HTMLButtonElement>("#transcript-dialog-download")

    if (!dialog || !titleElement || !metaElement || !bodyElement) {
        return
    }

    titleElement.textContent = meeting.meetingTitle || meeting.title || "Meeting"
    metaElement.textContent = [
        meeting.meetingSoftware,
        new Date(meeting.meetingStartTimestamp).toLocaleString(),
        getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)
    ].filter(part => part).join("  •  ")

    bodyElement.innerHTML = ""
    if (meeting.summary) {
        const heading = document.createElement("h3")
        heading.textContent = "Summary"
        bodyElement.appendChild(heading)

        const summaryElement = document.createElement("p")
        summaryElement.className = "dialog-block-text"
        summaryElement.textContent = meeting.summary
        bodyElement.appendChild(summaryElement)
    }
    bodyElement.appendChild(buildSection("Transcript", meeting.transcript.map(block => ({
        personName: block.personName,
        timestamp: block.timestamp,
        text: block.transcriptText
    })), "No transcript was captured for this meeting."))
    bodyElement.appendChild(buildSection("Chat messages", meeting.chatMessages.map(message => ({
        personName: message.personName,
        timestamp: message.timestamp,
        text: message.chatMessageText
    })), "No chat messages were captured for this meeting."))
    bodyElement.scrollTop = 0

    // Listeners are replaced per open, so the buttons always act on the meeting on screen
    if (closeButton) {
        closeButton.onclick = () => dialog.close()
    }

    // Click outside to dismiss. A click on the backdrop reports the dialog itself as the
    // target, and the dialog has no padding of its own, so nothing inside can match.
    // The closedby="any" attribute does this natively but only on very recent browsers.
    dialog.onclick = (event) => {
        if (event.target === dialog) {
            dialog.close()
        }
    }
    if (copyButton) {
        copyButton.textContent = "Copy"
        copyButton.onclick = () => {
            navigator.clipboard.writeText(getPlainText(meeting)).then(() => {
                copyButton.textContent = "Copied!"
            }).catch((error) => {
                copyButton.textContent = "Copy failed"
                console.error("Could not copy transcript:", error)
            })
        }
    }
    if (downloadButton) {
        downloadButton.onclick = () => {
            const message: ExtensionMessage = { type: "download_transcript_at_index", index: index }
            chrome.runtime.sendMessage(message, (responseUntyped) => {
                const response = responseUntyped as ExtensionResponse
                if (!response.success) {
                    alert("Could not download transcript")
                }
            })
        }
    }

    dialog.showModal()
}

/** One titled group of speaker blocks, or a placeholder when there is nothing to show. */
function buildSection(heading: string, blocks: { personName: string, timestamp: string, text: string }[], emptyMessage: string): DocumentFragment {
    const fragment = document.createDocumentFragment()

    const headingElement = document.createElement("h3")
    headingElement.textContent = heading
    fragment.appendChild(headingElement)

    if (blocks.length === 0) {
        const empty = document.createElement("p")
        empty.className = "sub-text"
        empty.textContent = emptyMessage
        fragment.appendChild(empty)
        return fragment
    }

    blocks.forEach(block => {
        const wrapper = document.createElement("div")
        wrapper.className = "dialog-block"

        const speaker = document.createElement("span")
        speaker.className = "dialog-block-speaker"
        speaker.textContent = block.personName

        const time = document.createElement("span")
        time.className = "dialog-block-time"
        time.textContent = new Date(block.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

        const text = document.createElement("p")
        text.className = "dialog-block-text"
        text.textContent = block.text

        wrapper.appendChild(speaker)
        wrapper.appendChild(time)
        wrapper.appendChild(text)
        fragment.appendChild(wrapper)
    })

    return fragment
}

/** The same plain text layout as the downloaded file, for the clipboard. */
function getPlainText(meeting: Meeting): string {
    let content = ""
    meeting.transcript.forEach(block => {
        content += `${block.personName} (${new Date(block.timestamp).toLocaleString()})\n${block.transcriptText}\n\n`
    })
    content += `\n---------------\nCHAT MESSAGES\n---------------\n\n`
    meeting.chatMessages.forEach(message => {
        content += `${message.personName} (${new Date(message.timestamp).toLocaleString()})\n${message.chatMessageText}\n\n`
    })
    return content
}

/** The name written into transcripts wherever captions say "You". */
function setupParticipantNameSetting(): void {
    const form = document.querySelector<HTMLFormElement>("#participant-name-form")
    const input = document.querySelector<HTMLInputElement>("#participant-name")
    if (!form || !input) {
        return
    }

    chrome.storage.sync.get(["participantName"], function (resultSyncUntyped) {
        const resultSync = resultSyncUntyped as Partial<ResultSync>
        input.value = resultSync.participantName ?? ""
    })

    form.addEventListener("submit", function (e) {
        e.preventDefault()
        const participantName = input.value.trim()
        chrome.storage.sync.set({ participantName: participantName }, function () {
            input.value = participantName
            alert(participantName
                ? `Your speech will be attributed to "${participantName}" from the next meeting`
                : `Your speech will be attributed to "You" again`)
        })
    })
}

/**
 * Obsidian settings: enable toggle, API key, vault folder and the plugin address.
 *
 * The API key lives in chrome.storage.local rather than sync, so the credential never
 * leaves the device — the rest of the settings sync normally.
 */
function setupObsidianSettings(): void {
    const enabledToggle = document.querySelector<HTMLInputElement>("#obsidian-enabled")
    const apiKeyForm = document.querySelector<HTMLFormElement>("#obsidian-api-key-form")
    const apiKeyInput = document.querySelector<HTMLInputElement>("#obsidian-api-key")
    const folderForm = document.querySelector<HTMLFormElement>("#obsidian-folder-form")
    const folderInput = document.querySelector<HTMLInputElement>("#obsidian-folder")
    const summaryFolderForm = document.querySelector<HTMLFormElement>("#obsidian-summary-folder-form")
    const summaryFolderInput = document.querySelector<HTMLInputElement>("#obsidian-summary-folder")
    const baseUrlForm = document.querySelector<HTMLFormElement>("#obsidian-base-url-form")
    const baseUrlInput = document.querySelector<HTMLInputElement>("#obsidian-base-url")
    const testButton = document.querySelector<HTMLButtonElement>("#test-obsidian")
    const testResult = document.querySelector<HTMLElement>("#obsidian-test-result")

    chrome.storage.sync.get(["obsidianEnabled", "obsidianFolder", "obsidianSummaryFolder", "obsidianBaseUrl"], function (resultSyncUntyped) {
        const resultSync = resultSyncUntyped as Partial<ResultSync>

        if (enabledToggle) {
            enabledToggle.checked = resultSync.obsidianEnabled === true
        }
        if (folderInput) {
            // An empty string is a real choice ("vault root"), so only fall back to the
            // default when nothing has ever been stored.
            folderInput.value = typeof resultSync.obsidianFolder === "string"
                ? resultSync.obsidianFolder
                : DEFAULT_OBSIDIAN_FOLDER
        }
        if (summaryFolderInput) {
            summaryFolderInput.value = typeof resultSync.obsidianSummaryFolder === "string"
                ? resultSync.obsidianSummaryFolder
                : DEFAULT_OBSIDIAN_SUMMARY_FOLDER
        }
        if (baseUrlInput) {
            baseUrlInput.value = resultSync.obsidianBaseUrl || DEFAULT_OBSIDIAN_BASE_URL
        }
    })

    chrome.storage.local.get(["obsidianApiKey"], function (resultLocalUntyped) {
        const resultLocal = resultLocalUntyped as Partial<ResultLocal>
        if (apiKeyInput && resultLocal.obsidianApiKey) {
            apiKeyInput.value = resultLocal.obsidianApiKey
        }
    })

    enabledToggle?.addEventListener("change", function () {
        if (!enabledToggle.checked) {
            chrome.storage.sync.set({ obsidianEnabled: false }, function () { })
            return
        }

        // Turning it on needs host permission for the plugin's address. Requesting it
        // here keeps the prompt inside a user gesture, which Chrome requires.
        requestObsidianPermission(baseUrlInput?.value || DEFAULT_OBSIDIAN_BASE_URL).then(() => {
            chrome.storage.sync.set({ obsidianEnabled: true }, function () { })
        }).catch((error) => {
            enabledToggle.checked = false
            alert("TranscripTonic needs permission to talk to Obsidian on this machine.")
            console.error("Obsidian permission error:", error)
        })
    })

    apiKeyForm?.addEventListener("submit", function (e) {
        e.preventDefault()
        if (!apiKeyInput) return
        chrome.storage.local.set({ obsidianApiKey: apiKeyInput.value.trim() }, function () {
            alert(apiKeyInput.value.trim() ? "Obsidian API key saved!" : "Obsidian API key cleared")
        })
    })

    folderForm?.addEventListener("submit", function (e) {
        e.preventDefault()
        if (!folderInput) return
        // Store the cleaned value so the field always shows what will actually be used
        const obsidianFolder = getFolderPrefix(folderInput.value, DEFAULT_OBSIDIAN_FOLDER).replace(/\/$/, "")
        chrome.storage.sync.set({ obsidianFolder: obsidianFolder }, function () {
            folderInput.value = obsidianFolder
            alert(obsidianFolder
                ? `Meeting notes will be saved to ${obsidianFolder}/ in your vault`
                : "Meeting notes will be saved to your vault root")
        })
    })

    summaryFolderForm?.addEventListener("submit", function (e) {
        e.preventDefault()
        if (!summaryFolderInput) return
        const obsidianSummaryFolder = getFolderPrefix(summaryFolderInput.value, DEFAULT_OBSIDIAN_SUMMARY_FOLDER).replace(/\/$/, "")
        chrome.storage.sync.set({ obsidianSummaryFolder: obsidianSummaryFolder }, function () {
            summaryFolderInput.value = obsidianSummaryFolder
            alert(obsidianSummaryFolder
                ? `Summaries will be saved to ${obsidianSummaryFolder}/ in your vault`
                : "Summaries will be saved to your vault root")
        })
    })

    baseUrlForm?.addEventListener("submit", function (e) {
        e.preventDefault()
        if (!baseUrlInput) return
        const obsidianBaseUrl = baseUrlInput.value.trim() || DEFAULT_OBSIDIAN_BASE_URL
        requestObsidianPermission(obsidianBaseUrl).then(() => {
            chrome.storage.sync.set({ obsidianBaseUrl: obsidianBaseUrl }, function () {
                baseUrlInput.value = obsidianBaseUrl
                alert("Obsidian address saved!")
            })
        }).catch((error) => {
            alert("TranscripTonic needs permission to talk to Obsidian at that address.")
            console.error("Obsidian permission error:", error)
        })
    })

    testButton?.addEventListener("click", function () {
        if (!testResult) return
        const baseUrl = (baseUrlInput?.value.trim() || DEFAULT_OBSIDIAN_BASE_URL).replace(/\/+$/, "")
        const apiKey = apiKeyInput?.value.trim() || ""

        testResult.textContent = "Checking..."
        requestObsidianPermission(baseUrl)
            .then(() => fetch(`${baseUrl}/`, { headers: { "Authorization": `Bearer ${apiKey}` } }))
            .then(response => response.json())
            .then(result => {
                testResult.textContent = result.authenticated
                    ? `Connected to Obsidian (Local REST API ${result.versions?.self ?? ""}).`
                    : "Obsidian is reachable, but the API key was not accepted. Check the key and save it."
            })
            .catch(() => {
                testResult.textContent = "Could not reach Obsidian. Make sure the app is running and the plugin's non-encrypted (HTTP) server is enabled."
            })
    })
}

/** Request host permission for ChatGPT, needed to drive its page. */
function requestChatGptPermission(): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.permissions.request({ origins: ["https://chatgpt.com/*"] })
            .then((granted) => {
                granted ? resolve("Permission granted") : reject(new Error("Permission denied"))
            })
            .catch(reject)
    })
}

/** Request host permission for the Obsidian plugin's origin. */
function requestObsidianPermission(baseUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(baseUrl)
            chrome.permissions.request({
                origins: [`${urlObj.protocol}//${urlObj.hostname}/*`]
            }).then((granted) => {
                granted ? resolve("Permission granted") : reject(new Error("Permission denied"))
            }).catch(reject)
        } catch (error) {
            reject(error)
        }
    })
}

/** Load and display recent transcripts */
function loadMeetings(): void {
    const meetingsTable = document.querySelector("#meetings-table")

    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
        const resultLocal = resultLocalUntyped as Partial<ResultLocal>
        // Clear existing content
        if (meetingsTable) {
            meetingsTable.innerHTML = ""


            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                const meetings = resultLocal.meetings
                // Loop through the array in reverse order to list latest meeting first
                for (let i = meetings.length - 1; i >= 0; i--) {
                    const meeting = meetings[i]
                    const timestamp = new Date(meeting.meetingStartTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.meetingStartTimestamp, meeting.meetingEndTimestamp)

                    const row = document.createElement("tr")
                    row.innerHTML = `
                    <td>
                        <div contenteditable="true" class="meeting-title" data-index="${i}" title="Rename">
                        ${meeting.meetingTitle || meeting.title || "Google Meet call"}
                    </div>
                    </td>
                    <td>
                     ${meeting.meetingSoftware ? meeting.meetingSoftware : ""} 
                    </td>
                    <td>${timestamp} &nbsp; &#9679; &nbsp; ${durationString}</td>
                    <td>
                        ${(
                            () => {
                                switch (meeting.webhookPostStatus) {
                                    case "successful":
                                        return `<span class="status-success">Successful</span>`
                                    case "failed":
                                        return `<span class="status-failed">Failed</span>`
                                    case "new":
                                        return `<span class="status-new">New</span>`
                                    default:
                                        return `<span class="status-new">Unknown</span>`
                                }
                            }
                        )()}
                    </td>
                    <td>
                        ${(
                            () => {
                                switch (meeting.obsidianPostStatus) {
                                    case "successful":
                                        return `<span class="status-success">Saved</span>`
                                    case "failed":
                                        return `<span class="status-failed">Failed</span> <button class="obsidian-button" data-index="${i}" title="Retry saving to Obsidian">Retry</button>`
                                    default:
                                        return `<button class="obsidian-button" data-index="${i}" title="Save this meeting to Obsidian">Save</button>`
                                }
                            }
                        )()}
                    </td>
                    <td>
                        <div style="display: flex; gap: 1rem; justify-content: end">
                            <button class="view-button" data-index="${i}" title="View transcript" aria-label="View this meeting transcript">
                                <img src="./icons/view.svg" alt="">
                            </button>
                            <button class="summarize-button" data-index="${i}" title="${meeting.summary ? `Re-summarise with ChatGPT` : `Summarise with ChatGPT`}" aria-label="Summarise this meeting with ChatGPT">
                                ${meeting.summary ? `Re-summarise` : `Summarise`}
                            </button>
                            <button class="download-button" data-index="${i}" title="Download" aria-label="Download this meeting transcript">
                                <img src="./icons/download.svg" alt="">
                            </button>
                            <button class="post-button" data-index="${i}" title="${meeting.webhookPostStatus === "new" ? `Post webhook` : `Repost webhook`}" aria-label="${meeting.webhookPostStatus === "new" ? `` : ``}">
                                ${meeting.webhookPostStatus === "new" ? `` : ``}
                                <img src="./icons/webhook.svg" alt="">
                            </button>
                            &nbsp;
                             <button class="delete-button" data-index="${i}" title="Delete" aria-label="Delete this meeting">
                                <img src="./icons/delete.svg" alt="">
                            </button>
                        </div>
                    </td>
                `
                    meetingsTable.appendChild(row)

                    // Add event listener to meeting title input
                    const meetingTitleInput = row.querySelector(".meeting-title")
                    if (meetingTitleInput instanceof HTMLDivElement) {
                        meetingTitleInput.addEventListener("blur", function () {
                            const updatedMeeting: Meeting = {
                                ...meeting,
                                meetingTitle: meetingTitleInput.innerText
                            }
                            meetings[i] = updatedMeeting
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                console.log("Meeting title updated")
                            })
                        })
                    }

                    // Add event listener to the view button
                    const viewButton = row.querySelector(".view-button")
                    if (viewButton instanceof HTMLButtonElement) {
                        viewButton.addEventListener("click", function () {
                            openTranscriptDialog(meeting, i)
                        })
                    }

                    // Add event listener to the summarise button
                    const summarizeButton = row.querySelector(".summarize-button")
                    if (summarizeButton instanceof HTMLButtonElement) {
                        summarizeButton.addEventListener("click", function () {
                            // Requested from the click so it counts as a user gesture,
                            // which Chrome requires for an optional host permission.
                            requestChatGptPermission().then(() => {
                                summarizeButton.disabled = true
                                summarizeButton.textContent = "Summarising..."

                                const index = parseInt(summarizeButton.getAttribute("data-index") ?? "-1")
                                const message: ExtensionMessage = { type: "summarize_at_index", index: index }
                                chrome.runtime.sendMessage(message, (responseUntyped) => {
                                    const response = responseUntyped as ExtensionResponse
                                    loadMeetings()
                                    if (response.success) {
                                        chrome.storage.local.get(["meetings"], function (resultUntyped) {
                                            const result = resultUntyped as Partial<ResultLocal>
                                            const updated = result.meetings?.[index]
                                            if (updated) {
                                                openTranscriptDialog(updated, index)
                                            }
                                        })
                                    }
                                    else {
                                        const parsedError = response.message as ErrorObject
                                        alert(typeof parsedError === "object" ? parsedError.errorMessage : "Could not summarise this meeting")
                                    }
                                })
                            }).catch(() => {
                                alert("TranscripTonic needs access to chatgpt.com to summarise meetings.")
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const downloadButton = row.querySelector(".download-button")
                    if (downloadButton instanceof HTMLButtonElement) {
                        downloadButton.addEventListener("click", function () {
                            // Send message to background script to download text file
                            const index = parseInt(downloadButton.getAttribute("data-index") ?? "-1")
                            const message: ExtensionMessage = {
                                type: "download_transcript_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = responseUntyped as ExtensionResponse
                                if (!response.success) {
                                    alert("Could not download transcript")
                                    const parsedError = response.message as ErrorObject
                                    if (typeof parsedError === 'object') {
                                        console.error(parsedError.errorMessage)
                                    }
                                }
                            })
                        })
                    }

                    // Add event listener to the webhook post button
                    const webhookPostButton = row.querySelector(".post-button")
                    if (webhookPostButton instanceof HTMLButtonElement) {
                        webhookPostButton.addEventListener("click", function () {
                            chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
                                const resultSync = resultSyncUntyped as Partial<ResultSync>
                                if (resultSync.webhookUrl) {
                                    // Request runtime permission for the webhook URL. Needed for cases when user signs on a new browser—webhook URL and other sync variables are available, but runtime permissions will be missing.
                                    requestWebhookAndNotificationPermission(resultSync.webhookUrl).then(() => {
                                        // Disable button and update text
                                        webhookPostButton.disabled = true
                                        webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                                        // Send message to background script to post webhook
                                        const index = parseInt(webhookPostButton.getAttribute("data-index") ?? "-1")
                                        const message: ExtensionMessage = {
                                            type: "post_webhook_at_index",
                                            index: index
                                        }
                                        chrome.runtime.sendMessage(message, (responseUntyped) => {
                                            const response = responseUntyped as ExtensionResponse
                                            loadMeetings()
                                            if (response.success) {
                                                alert("Posted successfully!")
                                            }
                                            else {
                                                const parsedError = response.message as ErrorObject
                                                if (typeof parsedError === 'object') {
                                                    console.error(parsedError.errorMessage)
                                                }
                                            }
                                        })
                                    }).catch((error) => {
                                        alert("Fine! No webhooks for you!")
                                        console.error("Webhook permission error:", error)
                                    })
                                }
                                else {
                                    alert("Please provide a webhook URL")
                                }
                            })
                        })
                    }

                    // Add event listener to the Obsidian save/retry button
                    const obsidianButton = row.querySelector(".obsidian-button")
                    if (obsidianButton instanceof HTMLButtonElement) {
                        obsidianButton.addEventListener("click", function () {
                            obsidianButton.disabled = true
                            obsidianButton.textContent = "Saving..."

                            const index = parseInt(obsidianButton.getAttribute("data-index") ?? "-1")
                            const message: ExtensionMessage = {
                                type: "post_obsidian_at_index",
                                index: index
                            }
                            chrome.runtime.sendMessage(message, (responseUntyped) => {
                                const response = responseUntyped as ExtensionResponse
                                loadMeetings()
                                if (!response.success) {
                                    const parsedError = response.message as ErrorObject
                                    if (typeof parsedError === "object") {
                                        alert(parsedError.errorCode === "018"
                                            ? "Add your Obsidian API key below first."
                                            : parsedError.errorMessage)
                                        console.error(parsedError.errorMessage)
                                    }
                                }
                            })
                        })
                    }

                    // Add event listener to the meeting delete button
                    const deleteButton = row.querySelector(".delete-button")
                    if (deleteButton instanceof HTMLButtonElement) {
                        deleteButton.addEventListener("click", function () {
                            if (confirm("Delete this meeting?")) {
                                meetings.splice(i, 1)
                                chrome.storage.local.set({ meetings: meetings }, function () {
                                    console.log("Meeting title updated")
                                })
                            }
                        })
                    }
                }
                const meetingsTableContainer = document.querySelector("#meetings-table-container")
                if (!isMeetingsTableExpanded && meetingsTableContainer && (meetingsTableContainer.clientHeight > 280)) {
                    meetingsTableContainer?.classList.add("fade-mask")
                    document.querySelector("#show-all")?.setAttribute("style", "display: block")
                }
            }
            else {
                meetingsTable.innerHTML = `<tr><td colspan="6">Your next meeting will show up here</td></tr>`
            }
        }
    })
}

// Kept for reference. Currently not wired up—see the commented call in the DOMContentLoaded handler.
export function handlePermissions(): void {
    chrome.scripting
        .getRegisteredContentScripts()
        .then((scripts) => {
            console.log(scripts)
        })

    chrome.storage.sync.get(["wantGoogleMeet", "wantTeams", "wantZoom"], function (resultSyncUntyped) {
        const resultSync = resultSyncUntyped as Partial<ResultSync>

        console.log(resultSync)

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

        console.log(`Wanted platforms: ${wantedPlatforms}`)
        const message: ExtensionMessage = {
            type: "get_platform_permission_status",
            platform: wantedPlatforms
        }
        chrome.runtime.sendMessage(message, (responseUntyped) => {
            const response = responseUntyped as ExtensionResponse
            if (response.success) {
                console.log(response.message)

                const permissionMissingPlatforms: Platform[] = []

                for (let i = 0; i < wantedPlatforms.length; i++) {
                    if (Array.isArray(response.message) && response.message[i] === "Disabled") {
                        permissionMissingPlatforms.push(wantedPlatforms[i])
                    }
                }

                if (permissionMissingPlatforms.length > 0) {
                    const dialog = document.querySelector<HTMLDialogElement>('#permission-dialog')
                    const reviewButton = document.querySelector<HTMLButtonElement>('#review-button')
                    const laterButton = document.querySelector<HTMLButtonElement>('#later-button')

                    // Show the modal
                    dialog?.showModal()
                    reviewButton?.focus()

                    // Handle the "Confirm" action
                    reviewButton?.addEventListener("click", () => {
                        dialog?.close()

                        // This execution context is now considered a "User Gesture"
                        const disableMsg: ExtensionMessage = {
                            type: "disable_platform",
                            platform: permissionMissingPlatforms
                        }

                        chrome.runtime.sendMessage(disableMsg, (responseUntyped) => {
                            const disableResponse = responseUntyped as ExtensionResponse
                            if (disableResponse.success) {
                                const enableMsg: ExtensionMessage = {
                                    type: "enable_platform",
                                    platform: permissionMissingPlatforms
                                }
                                chrome.runtime.sendMessage(enableMsg)
                            }
                        })
                    })

                    // Handle the "Cancel" action
                    laterButton?.addEventListener("click", () => {
                        dialog?.close()
                    })

                }
            }
        })
    })
}

/** Format duration between two ISO timestamps */
function getDuration(meetingStartTimestamp: string, meetingEndTimestamp: string): string {
    const duration = new Date(meetingEndTimestamp).getTime() - new Date(meetingStartTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}
