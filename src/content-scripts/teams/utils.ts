import type { ExtensionStatusJSON } from "@lib/types"
import { LOGO_URL, commonCSS } from "../common-config"
import { waitForElement } from "../common-utils"
import { SELECTORS_TEAMS } from "./config"

/** Shows a responsive notification of specified type and message */
export function showNotificationTeams(extensionStatusJSON: ExtensionStatusJSON): void {
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
    text.style.cssText = "margin-top: 1rem; margin-bottom:1rem; font-size: medium"

    if (extensionStatusJSON.status === 200) {
        obj.style.cssText = `color: #2A9ACA ; bottom: 5%; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message

        // Remove banner once transcript is on
        waitForElement(SELECTORS_TEAMS.CAPTIONS_REGION_WRAPPER).then(() => {
            obj.style.display = "none"
        })
    }
    else {
        obj.style.cssText = `color: orange ; bottom: 5%; ${commonCSS}`
        text.innerHTML = extensionStatusJSON.message

        setTimeout(() => {
            obj.style.display = "none"
        }, 5000)
    }

    obj.prepend(text)
    obj.prepend(logo)
    if (html)
        html.append(obj)
}

export function dispatchLiveCaptionsShortcut(): void {
    let key: string
    let code: string
    let modifiers: KeyboardEventInit

    // Mac: Command+Shift+A
    key = 'a'
    code = 'KeyA'
    modifiers = { metaKey: true, shiftKey: true, bubbles: true }

    let event = new KeyboardEvent('keydown', {
        key: key,
        code: code,
        ...modifiers
    })
    document.dispatchEvent(event)

    // Windows: Alt+Shift+C (defaulting non-Mac to Windows)
    key = 'c'
    code = 'KeyC'
    modifiers = { altKey: true, shiftKey: true, bubbles: true }

    event = new KeyboardEvent('keydown', {
        key: key,
        code: code,
        ...modifiers
    })
    document.dispatchEvent(event)
}
