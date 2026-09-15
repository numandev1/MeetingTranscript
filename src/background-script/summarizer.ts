import type { ErrorObject, Meeting, ResultLocal } from "@lib/types"
import { getTranscriptString } from "./utils"

const CHATGPT_URL = "https://chatgpt.com/"
const CHATGPT_ORIGIN = "https://chatgpt.com/*"

/** ChatGPT refuses very long prompts, and a full day of captions can be enormous. */
const MAX_TRANSCRIPT_CHARS = 100000

/** How long to wait for the whole answer to finish streaming. */
const RESPONSE_TIMEOUT_MS = 180000

/** Consecutive unchanged polls before the answer is considered complete. */
const STABLE_POLLS_REQUIRED = 4

/**
 * Final line the model is asked to emit. Its presence is a definitive end-of-answer
 * signal, which the DOM alone does not give: the stop button can vanish while text is
 * still streaming, and a partly streamed answer looks identical to a finished one.
 */
const END_MARKER = "<!--meetingtranscript-end-->"
const POLL_INTERVAL_MS = 1000

export function buildSummaryPrompt(meeting: Meeting): string {
    const title = meeting.meetingTitle || meeting.title || "Meeting"
    const participants = [...new Set(meeting.transcript.map(block => block.personName))].filter(name => name.trim())

    let transcript = getTranscriptString(meeting.transcript)
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
        transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[transcript truncated]"
    }

    return [
        "Summarise the following meeting transcript. The transcript comes from automatic captions, so expect some transcription errors and ignore them.",
        "",
        `Meeting: ${title}`,
        `Date: ${new Date(meeting.meetingStartTimestamp).toLocaleString()}`,
        participants.length > 0 ? `Participants: ${participants.join(", ")}` : "",
        "",
        // The answer is read back out of the rendered page, where innerText would flatten
        // "## Summary" into "Summary". Asking for a fenced block keeps the markdown
        // characters intact, because code block text is not reformatted.
        "Reply with a single fenced code block containing markdown, and nothing outside it.",
        `The very last line inside the block must be exactly ${END_MARKER}`,
        "Inside the block use exactly these sections:",
        "",
        "## Summary",
        "Two to four sentences.",
        "",
        "## Key points",
        "Short bullets.",
        "",
        "## Decisions",
        'Short bullets, or "None recorded".',
        "",
        "## Action items",
        'Bullets shaped "- [ ] Owner — task", or "None recorded".',
        "",
        "Transcript:",
        "",
        transcript
    ].filter(line => line !== "").join("\n")
}

/**
 * Opens a dedicated ChatGPT tab for this summary and waits until it has finished loading.
 *
 * A new tab is used rather than the user's existing ChatGPT tab on purpose: navigating
 * that tab to a fresh conversation would throw away whatever they had open in it.
 */
function openChatGptTab(): Promise<number> {
    return new Promise((resolve, reject) => {
        chrome.permissions.contains({ origins: [CHATGPT_ORIGIN] }).then((hasPermission) => {
            if (!hasPermission) {
                reject({ errorCode: "020", errorMessage: "Could not open ChatGPT. Grant access to chatgpt.com and make sure you are signed in." } satisfies ErrorObject)
                return
            }

            chrome.tabs.create({ url: CHATGPT_URL, active: false }, function (tab) {
                const tabId = tab.id
                if (typeof tabId !== "number") {
                    reject({ errorCode: "020", errorMessage: "Could not open ChatGPT. Grant access to chatgpt.com and make sure you are signed in." } satisfies ErrorObject)
                    return
                }

                // tabs.create returns as soon as the tab exists, long before the page is
                // usable, so injecting straight away would race the navigation.
                function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
                    if ((updatedTabId === tabId) && (changeInfo.status === "complete")) {
                        chrome.tabs.onUpdated.removeListener(onUpdated)
                        resolve(tabId)
                    }
                }
                chrome.tabs.onUpdated.addListener(onUpdated)

                // Don't hang forever if the load event never lands
                setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(onUpdated)
                    resolve(tabId)
                }, 20000)
            })
        })
    })
}

/**
 * Runs fn inside the ChatGPT tab, in the page's own JavaScript world.
 *
 * MAIN world is required, not a preference: the composer is a ProseMirror editor, and
 * from an isolated world execCommand mutates the DOM without ProseMirror's model picking
 * it up. The editor then still reports empty, and because the send button is a
 * type="submit" inside a form, clicking it performs a native GET navigation to
 * "chatgpt.com/?prompt-textarea=" that destroys the page instead of sending anything.
 */
async function runInTab<T>(tabId: number, func: (...args: never[]) => T, args: unknown[] = []): Promise<T | undefined> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: func as (...args: unknown[]) => T,
        args: args
    }).catch((error) => {
        console.error("ChatGPT injection failed:", error)
        return null
    })
    return results?.[0]?.result as T | undefined
}

/**
 * Types the prompt into the composer and sends it.
 *
 * The composer is a ProseMirror contenteditable, so the text has to be inserted with
 * execCommand: assigning textContent leaves ProseMirror's internal model empty and the
 * send button never becomes available.
 */
async function submitPrompt(tabId: number, prompt: string): Promise<boolean> {
    // Wait for the composer, which appears well after load on a cold tab
    for (let attempt = 0; attempt < 40; attempt++) {
        const ready = await runInTab(tabId, () => !!document.querySelector("#prompt-textarea"))
        if (ready) break
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    const inserted = await runInTab(tabId, (text: string) => {
        const composer = document.querySelector<HTMLElement>("#prompt-textarea")
        if (!composer) return false
        composer.focus()
        return document.execCommand("insertText", false, text)
    }, [prompt])

    if (!inserted) return false

    // The send button is rendered only once the composer has content, one frame later.
    // The composer is re-checked on every attempt because clicking submit while it is
    // empty triggers a native form GET that navigates the page away.
    for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250))
        const clicked = await runInTab(tabId, () => {
            const composer = document.querySelector<HTMLElement>("#prompt-textarea")
            if (!composer || !(composer.innerText || "").trim()) return false

            const button = document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]')
            if (!button || button.disabled) return false
            button.click()
            return true
        })
        if (clicked) return true
    }
    return false
}

/** Polls until the answer stops changing. */
async function readResponse(tabId: number): Promise<string> {
    const startedAt = Date.now()
    let lastText = ""
    let stablePolls = 0

    while (Date.now() - startedAt < RESPONSE_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

        const reading = await runInTab(tabId, () => {
            const messages = document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')
            const last = messages[messages.length - 1]
            // Prefer the fenced block: its text keeps the markdown syntax, whereas the
            // rendered message would give "Summary" instead of "## Summary".
            const codeBlock = last?.querySelector<HTMLElement>("pre code")
            return {
                text: ((codeBlock?.innerText ?? last?.innerText) || "").trim(),
                busy: !!document.querySelector('button[data-testid="stop-button"]')
            }
        })

        if (!reading) continue

        // Definitive: the model has emitted its final line.
        if (reading.text.includes(END_MARKER)) {
            return reading.text.replace(END_MARKER, "").trim()
        }

        // Fallback for when the model omits the marker. The stop button disappears a beat
        // before the answer text is in the DOM, so an empty reading is never treated as a
        // finished answer, and the text must hold still for several polls.
        if (reading.text && (reading.text === lastText) && !reading.busy) {
            stablePolls++
            if (stablePolls >= STABLE_POLLS_REQUIRED) {
                return reading.text
            }
        }
        else {
            stablePolls = 0
            lastText = reading.text
        }
    }

    // Out of time, but a partial answer beats nothing
    return lastText
}

/**
 * Summarises a meeting by handing the transcript to the ChatGPT web app and reading the
 * answer back out of the page.
 *
 * This drives ChatGPT's UI rather than an API, so it depends on that page's DOM and will
 * need the selectors revisited whenever OpenAI restructures the composer or message list.
 *
 * @throws error codes: 010, 020, 021, 022
 */
export function summarizeMeeting(index: number): Promise<string> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], async function (resultLocalUntyped) {
            const resultLocal = resultLocalUntyped as Partial<ResultLocal>
            const meetings = resultLocal.meetings

            if (!meetings || !meetings[index]) {
                reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" } satisfies ErrorObject)
                return
            }

            const meeting = meetings[index]
            if (meeting.transcript.length === 0) {
                reject({ errorCode: "022", errorMessage: "Nothing to summarise for this meeting" } satisfies ErrorObject)
                return
            }

            try {
                const tabId = await openChatGptTab()
                const submitted = await submitPrompt(tabId, buildSummaryPrompt(meeting))

                if (!submitted) {
                    throw { errorCode: "020", errorMessage: "Could not open ChatGPT. Grant access to chatgpt.com and make sure you are signed in." } satisfies ErrorObject
                }

                const summary = await readResponse(tabId)
                if (!summary) {
                    throw { errorCode: "021", errorMessage: "ChatGPT did not return a summary in time" } satisfies ErrorObject
                }

                // Leave the tab open when something went wrong, so the user can see why
                // (signed out, rate limited); close it on the happy path.
                chrome.tabs.remove(tabId).catch(() => { })

                meetings[index].summary = summary
                meetings[index].summaryStatus = "successful"
                chrome.storage.local.set({ meetings: meetings }, function () {
                    resolve(summary)
                })
            }
            catch (error) {
                const parsedError = error as ErrorObject
                meetings[index].summaryStatus = "failed"
                chrome.storage.local.set({ meetings: meetings }, function () {
                    reject(parsedError.errorCode
                        ? parsedError
                        : { errorCode: "021", errorMessage: String(error) } satisfies ErrorObject)
                })
            }
        })
    })
}
