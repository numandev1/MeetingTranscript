export const SELECTORS_GOOGLE_MEET = {
    USER_NAME: ".awLEm",
    MEETING_TITLE: ".u6vdEc",
    GOOGLE_SYMBOLS: ".google-symbols",
    TEXT_CALL_END: "call_end",
    // Meet swaps the ligature to reflect state: "_off" means captions are currently
    // off (clicking turns them on), the bare name means they are already on.
    TEXT_CAPTIONS_OFF: "closed_caption_off",
    TEXT_CAPTIONS_ON: "closed_caption",
    TEXT_CHAT: "chat",
    TRANSCRIPT_REGION: 'div[role="region"][tabindex="0"]',
    CHAT_LIVE_REGION: 'div[aria-live="polite"].Ge9Kpc',
    // Every chat message carries a stable id like "spaces/<id>/messages/<id>"
    CHAT_MESSAGE: "[data-message-id]",
    // Sender name + timestamp header, once per run of consecutive messages
    CHAT_GROUP_HEADER: ".HNucUd"
}
