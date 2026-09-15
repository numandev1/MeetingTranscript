// Tests for the pure logic in src/lib. Node's built-in runner, no dependencies.
// Run against the CommonJS build that `npm run pretest` emits into .test-build/.
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const paths = require("../.test-build/lib/paths.js")
const transfer = require("../.test-build/lib/settings-transfer.js")
const importer = require("../.test-build/lib/transcript-import.js")
const retention = require("../.test-build/lib/retention.js")

const { getFolderPrefix, withAccountSubfolder, DEFAULT_OBSIDIAN_FOLDER, DEFAULT_DOWNLOAD_SUBFOLDER } = paths

test("folder prefix keeps ordinary values", () => {
  assert.equal(getFolderPrefix("MeetingTranscript", DEFAULT_DOWNLOAD_SUBFOLDER), "MeetingTranscript/")
  assert.equal(getFolderPrefix("work/calls", DEFAULT_DOWNLOAD_SUBFOLDER), "work/calls/")
  assert.equal(getFolderPrefix(undefined, "Fallback"), "Fallback/")
})

test("empty folder means the root, not the default", () => {
  assert.equal(getFolderPrefix("", DEFAULT_DOWNLOAD_SUBFOLDER), "")
  assert.equal(getFolderPrefix("   ", DEFAULT_DOWNLOAD_SUBFOLDER), "")
})

test("a folder cannot escape its root", () => {
  // chrome.downloads rejects these outright; the vault would be written outside its folder
  assert.equal(getFolderPrefix("../../etc", "X"), "etc/")
  assert.equal(getFolderPrefix("..", "X"), "")
  assert.equal(getFolderPrefix("/absolute/path", "X"), "absolute/path/")
  assert.equal(getFolderPrefix("a/../../b", "X"), "a/b/")
})

test("characters illegal in file names are stripped", () => {
  assert.equal(getFolderPrefix('my:folder', "X"), "myfolder/")
  assert.equal(getFolderPrefix('a?b*c', "X"), "abc/")
})

test("the vault is always parent / account / note", () => {
  const base = getFolderPrefix(undefined, DEFAULT_OBSIDIAN_FOLDER)
  assert.equal(withAccountSubfolder(base, "muhammadnuman70@gmail.com"), "Meetings/muhammadnuman70@gmail.com/")
  // An unknown account still gets its own level, so every note sits at the same depth
  assert.equal(withAccountSubfolder(base, undefined), "Meetings/unknown-account/")
  assert.equal(withAccountSubfolder(base, ""), "Meetings/unknown-account/")
  assert.equal(withAccountSubfolder(base, "   "), "Meetings/unknown-account/")
})

test("the account level survives a custom parent and a vault root", () => {
  assert.equal(withAccountSubfolder("Work/Calls/", "a@b.com"), "Work/Calls/a@b.com/")
  assert.equal(withAccountSubfolder("", "a@b.com"), "a@b.com/")
  assert.equal(withAccountSubfolder("", undefined), "unknown-account/")
})

test("a hostile account address cannot escape the folder", () => {
  assert.equal(withAccountSubfolder("Meetings/", "a/../../b@x.com"), "Meetings/a/b@x.com/")
  // A value that sanitises away entirely must not collapse the account level
  assert.equal(withAccountSubfolder("Meetings/", ".."), "Meetings/unknown-account/")
})

const settings = {
  operationMode: "manual", hideCaptions: true, participantName: "Numan",
  webhookUrl: "https://example.com/hook", webhookBodyType: "advanced",
  autoPostWebhookAfterMeeting: true, autoDownloadFileAfterMeeting: false,
  downloadSubfolder: "MeetingTranscript", obsidianEnabled: false,
  obsidianFolder: "Meetings", obsidianSummaryFolder: "MeetingSummary",
  obsidianBaseUrl: "http://127.0.0.1:27123",
  wantGoogleMeet: true, wantTeams: false, wantZoom: true,
}

test("settings survive an export and import round trip", () => {
  const file = transfer.buildSettingsFile(settings, "secret-key")
  const back = transfer.parseSettingsFile(JSON.stringify(file))
  for (const key of transfer.TRANSFERABLE_SYNC_KEYS) {
    assert.equal(back.settings[key], settings[key], `${key} did not survive`)
  }
  assert.equal(back.obsidianApiKey, "secret-key")
})

test("the api key is only included when asked for", () => {
  const file = transfer.buildSettingsFile(settings)
  assert.equal(file.obsidianApiKey, undefined)
})

test("import switches Obsidian on even when the export had it off", () => {
  const applied = transfer.withObsidianEnabled({ ...settings, obsidianEnabled: false })
  assert.equal(applied.obsidianEnabled, true)
  assert.equal(transfer.withObsidianEnabled({}).obsidianFolder, "Meetings")
})

test("a settings file is untrusted input", () => {
  assert.throws(() => transfer.parseSettingsFile("{nope"), /not valid JSON/)
  assert.throws(() => transfer.parseSettingsFile('{"kind":"other","version":1,"settings":{}}'), /not exported from/)
  assert.throws(() => transfer.parseSettingsFile(JSON.stringify({
    kind: "meetingtranscript-settings", version: 99, settings: { operationMode: "auto" } })), /newer version/)
})

test("unknown and wrong-typed settings are dropped, not stored", () => {
  const parsed = transfer.parseSettingsFile(JSON.stringify({
    kind: "meetingtranscript-settings", version: 1,
    settings: { operationMode: "auto", evilKey: "payload", obsidianFolder: { nested: true }, hideCaptions: 123 },
  }))
  assert.equal(parsed.settings.operationMode, "auto")
  assert.equal("evilKey" in parsed.settings, false)
  assert.equal("obsidianFolder" in parsed.settings, false)
  assert.equal("hideCaptions" in parsed.settings, false)
  assert.equal({}.evilKey, undefined, "prototype was polluted")
})

test("an exported transcript file round trips", () => {
  const meeting = importer.parseTranscriptFile(
    "Google Meet transcript-Sync at 15-09-2026, 01-05 pm on.txt",
    `Priya (15/09/2026, 01:05 PM)\nHello everyone\nand a second line\n\nCarlos O'Brien (15/09/2026, 01:06 PM)\nHi Priya\n\n\n---------------\nCHAT MESSAGES\n---------------\n\nPriya (15/09/2026, 01:07 PM)\nlink here\n`)

  assert.equal(meeting.meetingTitle, "Sync")
  assert.equal(meeting.meetingSoftware, "Google Meet")
  assert.equal(meeting.transcript.length, 2)
  assert.equal(meeting.transcript[0].transcriptText, "Hello everyone\nand a second line")
  assert.equal(meeting.transcript[1].personName, "Carlos O'Brien")
  assert.equal(meeting.chatMessages.length, 1)
})

test("Chrome's uniquify suffix does not end up in the title", () => {
  // " (1)" is appended whenever a download name already exists
  const parsed = importer.parseTranscriptFileName(
    "Google Meet transcript-Standup at 14-09-2026, 06-13 pm on (1).txt")
  assert.equal(parsed.meetingTitle, "Standup")
  assert.match(parsed.startedAt, /^2026-09-14/)
})

test("am and pm are read correctly", () => {
  assert.equal(new Date(importer.parseTranscriptFileName(
    "Google Meet transcript-A at 14-09-2026, 06-13 pm on.txt").startedAt).getHours(), 18)
  assert.equal(new Date(importer.parseTranscriptFileName(
    "Google Meet transcript-A at 14-09-2026, 09-05 am on.txt").startedAt).getHours(), 9)
})

test("a file with no recognisable headers still imports", () => {
  const meeting = importer.parseTranscriptFile("notes.txt", "just some text\nwith no headers")
  assert.equal(meeting.transcript.length, 1)
  assert.equal(meeting.transcript[0].personName, "Unknown")
})

test("an empty file is rejected rather than imported as nothing", () => {
  assert.throws(() => importer.parseTranscriptFile("empty.txt", "   \n\n  "), /no transcript/)
})

const meetingsFixture = (n) => Array.from({ length: n }, (_, i) => ({
  meetingTitle: `Meeting ${i + 1}`,
  meetingStartTimestamp: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
  meetingEndTimestamp: `2026-09-${String(i + 1).padStart(2, "0")}T10:30:00.000Z`,
  transcript: [], chatMessages: [], webhookPostStatus: "new",
}))

test("retention keeps the newest meetings and drops the oldest", () => {
  const kept = retention.trimMeetings(meetingsFixture(12), 10)
  assert.equal(kept.length, 10)
  assert.equal(kept[0].meetingTitle, "Meeting 3", "should drop from the front")
  assert.equal(kept.at(-1).meetingTitle, "Meeting 12", "newest must survive")
})

test("a limit of 0 keeps every meeting", () => {
  assert.equal(retention.trimMeetings(meetingsFixture(40), 0).length, 40)
  assert.equal(retention.trimMeetings(meetingsFixture(40), -1).length, 40)
})

test("retention never mutates the list it is given", () => {
  const original = meetingsFixture(12)
  const copy = [...original]
  retention.trimMeetings(original, 5)
  assert.deepEqual(original, copy, "input was mutated")
})

test("retention reports exactly how many meetings it would drop", () => {
  assert.equal(retention.meetingsDroppedBy(meetingsFixture(12), 10), 2)
  assert.equal(retention.meetingsDroppedBy(meetingsFixture(3), 10), 0)
  assert.equal(retention.meetingsDroppedBy(meetingsFixture(50), 0), 0, "keep-everything drops nothing")
})

test("retention only ever returns meetings, so it cannot reach the vault", () => {
  // The guarantee behind the UI copy: this takes meetings and returns meetings. It has
  // no vault, download or webhook access, so the limit can only affect the browser copy.
  const kept = retention.trimMeetings(meetingsFixture(12), 4)
  assert.ok(Array.isArray(kept))
  assert.equal(retention.trimMeetings.length, 2, "takes only (meetings, keep)")
  assert.equal(kept.every(m => typeof m.meetingStartTimestamp === "string"), true)
})
