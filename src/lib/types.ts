/** Human friendly meeting software name. */
export type MeetingSoftware = "Google Meet" | "Zoom" | "Teams" | ""

/** Meeting platform. */
export type Platform = "google_meet" | "teams" | "zoom"

/**
 * Tab id of the meeting tab, captured when the meeting starts. A valid value or
 * "processing" indicates that a meeting is in progress. Set to null once the meeting
 * ends and associated processing is complete.
 */
export type MeetingTabId = number | "processing" | null

/** Mode of the extension, deciding whether transcripts are captured automatically. */
export type OperationMode = "auto" | "manual"

/** Type of webhook body to use. */
export type WebhookBodyType = "simple" | "advanced"

/** A chunk of transcript. */
export interface TranscriptBlock {
  /** Name of the person who spoke. */
  personName: string
  /** ISO timestamp of when the words were spoken. */
  timestamp: string
  /** Actual transcript text. */
  transcriptText: string
}

/** A chat message. */
export interface ChatMessage {
  /** Name of the person who sent the message. */
  personName: string
  /** ISO timestamp of when the message was sent. */
  timestamp: string
  /** Actual message text. */
  chatMessageText: string
}

export interface WebhookBody {
  webhookBodyType: WebhookBodyType
  meetingSoftware: MeetingSoftware
  meetingTitle: string
  /** ISO timestamp of when the meeting started. */
  meetingStartTimestamp: string
  /** ISO timestamp of when the meeting ended. */
  meetingEndTimestamp: string
  /** Transcript as a formatted string, or the raw transcript blocks. */
  transcript: TranscriptBlock[] | string
  /** Chat messages as a formatted string, or the raw chat messages. */
  chatMessages: ChatMessage[] | string
}

export interface ExtensionStatusJSON {
  status: number
  message: string
  showBetaMessage?: boolean
}

export interface Meeting {
  meetingSoftware?: MeetingSoftware
  meetingTitle?: string | undefined
  /** Older key for meetingTitle, as written by v3.1.0. */
  title?: string | undefined
  /** ISO timestamp of when the meeting started. */
  meetingStartTimestamp: string
  /** ISO timestamp of when the meeting ended. */
  meetingEndTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  webhookPostStatus: "new" | "failed" | "successful"
}

/**
 * Buffer holding the utterance currently being spoken. Pushed into the transcript
 * array as a transcript block when the speaker or the captions node changes.
 */
export interface StateTranscriptBlock {
  timestamp: string
  mutationTargetElement: Element | null
  personName: string
  transcriptTextBuffer: string
}

export interface ContentScriptState {
  meetingSoftware: MeetingSoftware
  platform: Platform
  userName: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  stateTranscriptBlock: StateTranscriptBlock
  /** ISO timestamp of when the most recent meeting started. */
  meetingStartTimestamp: string
  meetingTitle: string
  transcriptTargetNode: Element | null
  transcriptObserver: MutationObserver | null
  chatMessagesTargetNode: Element | null
  chatMessagesObserver: MutationObserver | null
  isTranscriptDomErrorCaptured: boolean
  isChatMessagesDomErrorCaptured: boolean
  hasMeetingStarted: boolean
  hasMeetingEnded: boolean
  extensionStatusJSON: ExtensionStatusJSON
}

export type ExtensionMessageType =
  | "new_meeting_started"
  | "meeting_ended"
  | "download_transcript_at_index"
  | "post_webhook_at_index"
  | "recover_last_meeting"
  | "get_platform_enablement_status"
  | "get_platform_permission_status"
  | "enable_platform"
  | "disable_platform"
  | "open_popup"
  | "open_side_panel"
  | "broadcast_live_buffer"

/** Message sent by the calling script. */
export interface ExtensionMessage {
  type: ExtensionMessageType
  /** Index of the meeting to process. */
  index?: number
  platform?: Platform | Platform[]
  stateTranscriptBlock?: StateTranscriptBlock
}

/** Response sent by the called script. */
export interface ExtensionResponse {
  success: boolean
  /** Message explaining success or failure. */
  message?: string | string[] | ErrorObject
}

export interface ErrorObject {
  errorCode: string
  errorMessage: string
}

/** Shape of chrome.storage.local. */
export interface ResultLocal {
  extensionStatusJSON: ExtensionStatusJSON
  meetingTabId: MeetingTabId
  meetingSoftware: MeetingSoftware
  /** Title of the most recent meeting, dumped by the content script. */
  meetingTitle: string
  /** ISO timestamp of when the most recent meeting started, dumped by the content script. */
  meetingStartTimestamp: string
  /** Transcript of the most recent meeting, dumped by the content script. */
  transcript: TranscriptBlock[]
  /** Chat messages captured during the most recent meeting, dumped by the content script. */
  chatMessages: ChatMessage[]
  /** Whether the extension has a deferred update waiting to be applied. */
  isDeferredUpdatedAvailable: boolean | undefined
  meetings: Meeting[] | undefined
}

/** Shape of chrome.storage.sync. */
export interface ResultSync {
  /** Whether to automatically post the webhook after each meeting. */
  autoPostWebhookAfterMeeting: boolean
  /** Whether to automatically download the transcript file after each meeting. */
  autoDownloadFileAfterMeeting: boolean
  operationMode: OperationMode
  /** Hide the captions on the UI by changing height and opacity. */
  hideCaptions: boolean
  webhookBodyType: WebhookBodyType
  webhookUrl: string
  /**
   * Indicates whether the user explicitly opted in for Google Meet. Does not necessarily
   * mean Google Meet is enabled for them — only an indicator to re-inject content scripts
   * between reloads.
   */
  wantGoogleMeet: boolean
  /** Indicates whether the user explicitly opted in for Teams. */
  wantTeams: boolean
  /** Indicates whether the user explicitly opted in for Zoom. */
  wantZoom: boolean
}

// CONTENT SCRIPT ERRORS
// | Error Code | Error Message |
// | :--- | :--- |
// | **001** | "Transcript element not found in DOM" |
// | **002** | "Chat messages element not found in DOM" (currently not in use) |
// | **003** | "Chat button element not found in DOM" |
// | **004** | "Call end button element not found in DOM" |
// | **005** | "Transcript mutation failed to process" |
// | **006** | "Chat messages mutation failed to process" |
// | **007** | "Meeting title element not found in DOM" (currently not in use) |
// | **008** | "Failed to fetch extension status" |
// | **016** | "Recovery timed out" |

// BACKGROUND SCRIPT ERRORS
// | Error Code | Error Message |
// | :--- | :--- |
// | **009** | "Failed to read blob" |
// | **010** | "Meeting at specified index not found" |
// | **011** | "Webhook request failed with HTTP status code [number] [statusText]" |
// | **012** | "No webhook URL configured" |
// | **013** | "No meetings found. May be attend one?" |
// | **014** | "Empty transcript and empty chatMessages" |
// | **015** | "Invalid index" |
