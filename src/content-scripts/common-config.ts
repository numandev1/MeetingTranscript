import type { ExtensionStatusJSON, Platform } from "@lib/types"

export const extensionStatusJSON_bug: ExtensionStatusJSON = {
    "status": 400,
    "message": `<strong>MeetingTranscriptToObsidian encountered a new error</strong> <br /> Please report it <a href="https://github.com/numandev/MeetingTranscript/issues" target="_blank">here</a>.`
}

export const reportErrorMessage = "There is a bug in MeetingTranscriptToObsidian. Please report it at https://github.com/numandev/MeetingTranscript/issues"

export const mutationConfig: MutationObserverInit = { childList: true, attributes: true, subtree: true, characterData: true }

// Bundled, so a meeting banner never fetches an image from a third party
export const LOGO_URL = chrome.runtime.getURL("icon.png")

export const commonCSS = `background: rgb(255 255 255 / 100%); 
    backdrop-filter: blur(16px); 
    position: fixed;
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    font-family: "Google Sans",Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`

export const NOTIFICATION_PLATFORM_CONFIGS: Record<Platform, { notificationText: string }> = {
    "google_meet": {
        notificationText: "<strong>MeetingTranscriptToObsidian is running</strong> <br /> Do not turn off captions"
    },
    "teams": {
        notificationText: "<b>MeetingTranscriptToObsidian is ready, enabling captions...</b> <br /> Please enable manually if not successful (More > Captions)"
    },
    "zoom": {
        notificationText: "MeetingTranscriptToObsidian is ready <br /> <b>Please switch on Zoom captions to begin (More > Captions)</b>"
    }
}
