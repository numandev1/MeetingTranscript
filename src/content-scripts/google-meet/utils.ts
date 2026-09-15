import type { ChatMessage, ContentScriptState, ExtensionStatusJSON } from "@lib/types"
import { LOGO_URL, commonCSS } from "../common-config"
import { overWriteChromeStorage, waitForElement } from "../common-utils"
import { SELECTORS_GOOGLE_MEET } from "./config"

/**
 * Returns all elements of the specified selector type whose text is exactly `text`.
 *
 * Matching is exact rather than a substring test: callers pass Google Symbols ligature
 * names, and an unanchored match makes "chat" also select "chat_bubble", so the first
 * result could be the wrong control entirely. waitForElement already compares exactly,
 * so this keeps the two in agreement.
 */
export function selectElements(selector: string, text: string): HTMLElement[] {
    const elements = document.querySelectorAll<HTMLElement>(selector)
    return Array.prototype.filter.call(elements, function (element: HTMLElement) {
        return (element.textContent ?? "").trim() === text
    })
}

/**
 * Returns the button that actually toggles a control, given its Google Symbols ligature.
 *
 * Meet renders more than one element per ligature — "chat" matches both an offscreen
 * copy with no button ancestor and the real toolbar control. Taking the first match
 * therefore clicked a hidden, non-clickable element and the chat panel never opened,
 * so no chat messages were ever rendered to be captured.
 */
export function selectControlButton(selector: string, text: string): HTMLElement | undefined {
    const matches = selectElements(selector, text)
    const clickable = matches
        .map(element => element.closest("button") as HTMLElement | null)
        .filter((button): button is HTMLElement => button !== null)

    return clickable.find(button => button.getBoundingClientRect().width > 0)
        ?? clickable[0]
        ?? matches[0]
}

/** Shows a responsive notification of specified type and message */
export function showNotificationGoogleMeet(extensionStatusJSON: ExtensionStatusJSON): void {
    // Banner CSS
    const html = document.querySelector("html")
    const obj = document.createElement("div")
    const logo = document.createElement("img")
    const text = document.createElement("p")

    logo.setAttribute(
        "src",
        LOGO_URL
    )
    logo.setAttribute("height", "32px")
    logo.setAttribute("width", "32px")
    logo.style.cssText = "border-radius: 4px"

    // Remove banner after 5s
    setTimeout(() => {
        obj.style.display = "none"
    }, 5000)

    if (extensionStatusJSON.status === 200) {
        obj.style.cssText = `color: #2A9ACA; top: 5%; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
    }
    else {
        obj.style.cssText = `color: orange; top: 5%; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message
    }

    obj.prepend(text)
    obj.prepend(logo)
    if (html)
        html.append(obj)
}

/** Grabs updated meeting title, if available */
export function updateMeetingTitleGoogleMeet(state: ContentScriptState): void {
    waitForElement(SELECTORS_GOOGLE_MEET.MEETING_TITLE).then((element) => {
        const meetingTitleElement = element as HTMLDivElement | null
        if (!meetingTitleElement) {
            return
        }
        meetingTitleElement.setAttribute("contenteditable", "true")
        meetingTitleElement.title = "Edit meeting title for TranscripTonic"
        meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`

        meetingTitleElement.addEventListener("input", handleMeetingTitleElementChange)

        // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
        setTimeout(() => {
            handleMeetingTitleElementChange()
            if (location.pathname === `/${meetingTitleElement.innerText}`) {
                showNotificationGoogleMeet({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
            }
        }, 7000)

        function handleMeetingTitleElementChange() {
            state.meetingTitle = (meetingTitleElement as HTMLDivElement).innerText
            overWriteChromeStorage(state, ["meetingTitle"], false)
        }
    })
}

/**
 * Attempt to get username before meeting starts. Abort interval if valid username is
 * found or if meeting starts and default to "You".
 */
export function captureUserName(state: ContentScriptState): void {
    waitForElement(SELECTORS_GOOGLE_MEET.USER_NAME).then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
            if (state.isUserNameLocked) {
                clearInterval(captureUserNameInterval)
                return
            }
            if (!state.hasMeetingStarted) {
                const capturedUserName = document.querySelector(SELECTORS_GOOGLE_MEET.USER_NAME)?.textContent
                if (capturedUserName) {
                    state.userName = capturedUserName
                    clearInterval(captureUserNameInterval)
                }
            }
            else {
                clearInterval(captureUserNameInterval)
            }
        }, 100)
    })
}

/** Pushes object to array only if it doesn't already exist. */
export function pushUniqueChatBlock(state: ContentScriptState, chatBlock: ChatMessage): void {
    const isExisting = state.chatMessages.some(item =>
        (item.personName === chatBlock.personName) &&
        (item.chatMessageText === chatBlock.chatMessageText)
    )
    if (!isExisting) {
        console.log(chatBlock)
        state.chatMessages.push(chatBlock)
        overWriteChromeStorage(state, ["chatMessages"], false)
    }
}
