export const SELECTORS_GOOGLE_MEET = {
    USER_NAME: ".awLEm",
    MEETING_TITLE: ".u6vdEc",
    GOOGLE_SYMBOLS: ".google-symbols",
    TEXT_CALL_END: "call_end",
    TEXT_CAPTIONS: "closed_caption_off",
    TEXT_CHAT: "chat",
    TRANSCRIPT_REGION: 'div[role="region"][tabindex="0"]',
    CHAT_LIVE_REGION: 'div[aria-live="polite"].Ge9Kpc',
    // Every chat message carries a stable id like "spaces/<id>/messages/<id>"
    CHAT_MESSAGE: "[data-message-id]",
    // Sender name + timestamp header, once per run of consecutive messages
    CHAT_GROUP_HEADER: ".HNucUd"
}
