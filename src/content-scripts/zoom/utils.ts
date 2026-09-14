import type { ExtensionStatusJSON } from "@lib/types"
import { commonCSS } from "../common-config"
import { waitForElement } from "../common-utils"
import { SELECTORS_ZOOM } from "./config"

export function hasIframeLoaded(iframe: HTMLIFrameElement): Promise<boolean> {
    return new Promise((resolve) => {
        if (iframe.contentDocument?.readyState) {
            resolve(true)
        }
        else {
            iframe?.addEventListener("load", () => {
                resolve(true)
            })
        }
    })
}

/** Shows a responsive notification of specified type and message */
export function showNotificationZoom(extensionStatusJSON: ExtensionStatusJSON): void {
    const iframe = document.querySelector(SELECTORS_ZOOM.IFRAME) as HTMLIFrameElement
    const iframeDOM = iframe.contentDocument

    if (iframeDOM) {
        // Banner CSS
        const html = iframeDOM.querySelector("html")
        const obj = iframeDOM.createElement("div")
        const logo = iframeDOM.createElement("img")
        const text = iframeDOM.createElement("p")

        logo.setAttribute(
            "src",
            "https://ejnana.github.io/transcripto-status/icon.png"
        )
        logo.setAttribute("height", "32px")
        logo.setAttribute("width", "32px")
        logo.style.cssText = "border-radius: 4px"
        text.style.cssText = "margin-top: 1rem; margin-bottom:1rem"

        if (extensionStatusJSON.status === 200) {
            obj.style.cssText = `color: #2A9ACA ; top: 5%; ${commonCSS}`
            text.innerHTML = extensionStatusJSON.message

            // Remove banner once transcript is on
            waitForElement(SELECTORS_ZOOM.TRANSCRIPT_CONTAINER, undefined, iframe).then(() => {
                obj.style.display = "none"
            })
        }
        else {
            obj.style.cssText = `color: orange ; top: 5%; ${commonCSS}`
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
}

/** Find person name using various strategies */
export function getPersonName(mutationTargetElement: ChildNode | null): string {
    const avatarElement = mutationTargetElement?.previousSibling as HTMLImageElement | null
    let currentPersonName = ""

    if (avatarElement?.tagName === "IMG") {
        const avatarSrc = avatarElement.src
        const hash = getAvatarIdentifier(avatarSrc)
        currentPersonName = "Person " + hash

        // Try to read if avatarSrc and name is available in local storage
        if ((localStorage.getItem(avatarSrc)) && (localStorage.getItem(avatarSrc)?.toString() !== "undefined")) {
            currentPersonName = localStorage.getItem(avatarSrc) as string
            return currentPersonName
        }

        // Check if another image of same src exists on the page and grab name from the video tile
        const iframe = document.querySelector(SELECTORS_ZOOM.IFRAME) as HTMLIFrameElement | null
        const iframeDOM = iframe?.contentDocument
        const avatarElements = iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)
        if (avatarElements && avatarElements.length > 1) {
            const personVideoTileElement = iframeDOM?.querySelectorAll(`img[src="${avatarSrc}"]`)[0]?.parentElement?.nextSibling
            if (personVideoTileElement && personVideoTileElement.textContent) {
                currentPersonName = personVideoTileElement.textContent
                // Store avatarSrc and name in local storage for future meetings
                localStorage.setItem(avatarSrc, currentPersonName)
            }
        }
    }

    return currentPersonName
}

/** Synchronously generates a 10-character hash identifier from a string */
export function getAvatarIdentifier(url: string | undefined): string {
    if (!url || typeof url !== 'string') {
        return '0000000000'
    }

    // FNV-1a 32-bit hashing algorithm
    let hash = 2166136261
    for (let i = 0; i < url.length; i++) {
        hash ^= url.charCodeAt(i)
        // Multiply by 32-bit FNV prime: 16777619
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }

    // Convert unsigned 32-bit int to 10-digit zero-padded base-36 string
    return (hash >>> 0).toString(36).padStart(10, '0').slice(0, 10)
}

/**
 * Finds the new part of string2 that has been added relative to string1.
 * @param string1 The original string.
 * @param string2 The modified string.
 * @returns The new part of the string, or string2 if no common part is found.
 */
export function findNewPart(string1: string, string2: string): string {
    // Scenario 1: string2 has characters added to the end.
    if (string2.startsWith(string1)) {
        return string2.substring(string1.length)
    }

    // Scenario 2: string2 has been truncated at the beginning and has a new part at the end.
    let tempString1 = string1
    while (tempString1.length > 0) {
        if (string2.startsWith(tempString1)) {
            return string2.substring(tempString1.length)
        }
        // Chop off one character from the beginning of the temporary string for next loop iteration
        tempString1 = tempString1.substring(1)
    }

    // No common suffix and prefix between the two strings. So the second string must be entirely new.
    return string2
}
