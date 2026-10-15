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
const merge = require("../.test-build/lib/meeting-merge.js")
const summaryText = require("../.test-build/lib/summary-text.js")

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

test("numeric settings transfer, but only sane ones", () => {
  const roundTrip = (settings) => transfer.parseSettingsFile(JSON.stringify({
    kind: "meetingtranscript-settings", version: 1, settings,
  })).settings

  assert.equal(roundTrip({ meetingsToKeep: 50 }).meetingsToKeep, 50)
  assert.equal(roundTrip({ meetingsToKeep: 0 }).meetingsToKeep, 0, "0 means keep everything")
  assert.equal("meetingsToKeep" in roundTrip({ meetingsToKeep: -1, operationMode: "auto" }), false)
  assert.equal("meetingsToKeep" in roundTrip({ meetingsToKeep: 2.5, operationMode: "auto" }), false)
  assert.equal("meetingsToKeep" in roundTrip({ meetingsToKeep: "10", operationMode: "auto" }), false)
})

test("every transferable setting is checked against its own type", () => {
  // A number in a boolean's place is a corrupt file, not a value to store
  const parsed = transfer.parseSettingsFile(JSON.stringify({
    kind: "meetingtranscript-settings", version: 1,
    settings: { autoSummarizeAfterMeeting: 1, summaryPrompt: true, operationMode: "auto" },
  }))
  assert.equal("autoSummarizeAfterMeeting" in parsed.settings, false)
  assert.equal("summaryPrompt" in parsed.settings, false)
})

test("the auto-summarise setting survives a round trip", () => {
  const file = transfer.buildSettingsFile({ autoSummarizeAfterMeeting: true, meetingsToKeep: 25 })
  const parsed = transfer.parseSettingsFile(JSON.stringify(file))
  assert.equal(parsed.settings.autoSummarizeAfterMeeting, true)
  assert.equal(parsed.settings.meetingsToKeep, 25)
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

test("the fenced block is only preferred when it actually holds text", () => {
  // The regression: ChatGPT renders the opening fence before any text lands inside it,
  // so an empty code block must never be read as the answer.
  assert.equal(summaryText.pickAnswerText("", "## Summary\nfrom the message"), "## Summary\nfrom the message")
  assert.equal(summaryText.pickAnswerText("   ", "from the message"), "from the message")
  assert.equal(summaryText.pickAnswerText(undefined, "from the message"), "from the message")
  // When it does hold text, it wins: it keeps the markdown the rendered message drops
  assert.equal(summaryText.pickAnswerText("## Summary\nfenced", "Summary fenced"), "## Summary\nfenced")
  assert.equal(summaryText.pickAnswerText("", ""), "")
  assert.equal(summaryText.pickAnswerText(undefined, undefined), "")
})

test("the end marker signals completion and is stripped wherever it lands", () => {
  const marker = summaryText.END_MARKER
  assert.equal(summaryText.isAnswerComplete("## Summary\ntext"), false)
  assert.equal(summaryText.isAnswerComplete(`## Summary\ntext\n${marker}`), true)
  assert.equal(summaryText.stripEndMarker(`## Summary\ntext\n${marker}`), "## Summary\ntext")
  // Renderers have been seen to repeat it; none of them may survive into the summary
  assert.equal(summaryText.stripEndMarker(`${marker}\n## Summary\n${marker}`), "## Summary")
})

test("a marker-less answer is only finished when generation demonstrably ended", () => {
  const base = { text: "## Summary\nhalf a sen", previousText: "## Summary\nhalf a sen", busy: false, sawGenerating: true }
  assert.equal(summaryText.isStableAnswer(base), true)

  // The regression: a lull before ChatGPT starts generating looked identical to a
  // finished answer, so the first burst was stored as the whole summary.
  assert.equal(summaryText.isStableAnswer({ ...base, sawGenerating: false }), false)
  // Still streaming
  assert.equal(summaryText.isStableAnswer({ ...base, busy: true }), false)
  // Text is still growing
  assert.equal(summaryText.isStableAnswer({ ...base, previousText: "## Summary\nhalf" }), false)
  // The stop button goes before the text lands, so empty is never finished
  assert.equal(summaryText.isStableAnswer({ ...base, text: "", previousText: "" }), false)
})

// The 23 Sep standup: the Meet page reloaded 17 seconds in, and the call was filed as
// two meetings — one block with a one-line summary, and the rest.
function rejoinPieces() {
  const url = "https://meet.google.com/abc-defg-hij"
  const first = {
    meetingSoftware: "Google Meet", meetingTitle: "Meet - Supply Chain Standup", meetingUrl: url,
    meetingStartTimestamp: "2026-09-23T07:17:08.887Z", meetingEndTimestamp: "2026-09-23T07:17:25.977Z",
    transcript: [{ personName: "Ahmad", timestamp: "2026-09-23T07:17:10.000Z", transcriptText: "Okay mostly expert community is here. So, yeah. okay I" }],
    chatMessages: [], webhookPostStatus: "successful", obsidianPostStatus: "successful",
    summary: "One line.", summaryStatus: "successful",
  }
  const second = {
    meetingSoftware: "Google Meet", meetingTitle: "Google Meet", meetingUrl: url,
    meetingStartTimestamp: "2026-09-23T07:17:50.281Z", meetingEndTimestamp: "2026-09-23T07:31:56.120Z",
    transcript: [
      { personName: "Ahmad", timestamp: "2026-09-23T07:17:50.000Z", transcriptText: "Okay mostly expert community is here. So, yeah. Okay, I don't have anything specific." },
      { personName: "Ahmed", timestamp: "2026-09-23T07:19:00.000Z", transcriptText: "We had the discussions yesterday." },
    ],
    chatMessages: [], webhookPostStatus: "new", obsidianPostStatus: "new",
  }
  return { first, second }
}

test("a reload of the same Meet call is a rejoin", () => {
  const { first, second } = rejoinPieces()
  assert.equal(merge.isRejoinOf(first, second), true)
})

test("different URLs, platforms and accounts stay separate", () => {
  const { first, second } = rejoinPieces()
  assert.equal(merge.isRejoinOf(first, { ...second, meetingUrl: "https://meet.google.com/xyz-abcd-efg" }), false)
  assert.equal(merge.isRejoinOf(first, { ...second, meetingSoftware: "Teams" }), false)
  assert.equal(merge.isRejoinOf({ ...first, meetingUrl: undefined }, second), false)
  assert.equal(merge.isRejoinOf({ ...first, accountEmail: "a@x.com" }, { ...second, accountEmail: "b@x.com" }), false)
  assert.equal(merge.isRejoinOf(undefined, second), false)
})

test("merging keeps one meeting, the real title and the first start time", () => {
  const { first, second } = rejoinPieces()
  const merged = merge.mergeRejoin(first, second)
  assert.equal(merged.meetingTitle, "Meet - Supply Chain Standup")
  assert.equal(merged.meetingStartTimestamp, first.meetingStartTimestamp)
  assert.equal(merged.meetingEndTimestamp, second.meetingEndTimestamp)
  // The cut-off sentence is replaced by its full version, not repeated
  assert.equal(merged.transcript.length, 2)
  assert.match(merged.transcript[0].transcriptText, /don't have anything specific/)
  // The first piece's summary described 17 seconds; it must not pass for the whole call
  assert.equal(merged.summary, undefined)
  assert.equal(merged.summaryStatus, undefined)
  assert.equal(merged.obsidianPostStatus, "new")
  assert.equal(merged.webhookPostStatus, "new")
})

test("recovery recognises a piece that was merged in", () => {
  const { first, second } = rejoinPieces()
  const merged = merge.mergeRejoin(first, second)
  assert.equal(merge.coversStartTimestamp(merged, first.meetingStartTimestamp), true)
  assert.equal(merge.coversStartTimestamp(merged, second.meetingStartTimestamp), true)
  assert.equal(merge.coversStartTimestamp(merged, "2026-09-24T07:00:00.000Z"), false)
  assert.equal(merge.coversStartTimestamp(undefined, second.meetingStartTimestamp), false)
})

test("unrelated last blocks are both kept", () => {
  const { first, second } = rejoinPieces()
  const merged = merge.mergeRejoin(first, { ...second, transcript: [{ personName: "Ahmed", timestamp: "x", transcriptText: "Hello" }] })
  assert.equal(merged.transcript.length, 2)
})

test("a few seconds of speech is not summarised automatically", () => {
  const { first, second } = rejoinPieces()
  assert.equal(merge.hasEnoughToSummarize(first), false)
  const long = { ...second, transcript: [{ personName: "A", timestamp: "x", transcriptText: "word ".repeat(60) }] }
  assert.equal(merge.hasEnoughToSummarize(long), true)
})

test("meeting address ignores the query string", () => {
  assert.equal(merge.normaliseMeetingUrl("https://meet.google.com/abc-defg-hij?authuser=1"), "https://meet.google.com/abc-defg-hij")
  assert.equal(merge.normaliseMeetingUrl(undefined), undefined)
  assert.equal(merge.normaliseMeetingUrl("not a url"), undefined)
})

const summaryMarkdown = require("../.test-build/lib/summary-markdown.js")

test("summary markdown is read into headings, paragraphs and lists", () => {
  const blocks = summaryMarkdown.parseSummaryMarkdown(
    "## Summary\nRollout is on track.\nSecond line.\n\n## Action items\n- [ ] **Numan**: review schema\n- [x] Ship it\n\n1. First\n2. Second"
  )
  assert.deepEqual(blocks.map(b => b.kind), ["heading", "paragraph", "heading", "list", "list"])
  assert.equal(blocks[1].runs[0].text, "Rollout is on track. Second line.")
  assert.deepEqual(blocks[3].items[0], {
    runs: [{ text: "Numan", bold: true }, { text: ": review schema", bold: false }],
    checked: false,
  })
  assert.equal(blocks[3].items[1].checked, true)
  assert.equal(blocks[4].items.length, 2)
})

test("summary markdown never turns text into markup", () => {
  const [block] = summaryMarkdown.parseSummaryMarkdown("<img src=x onerror=alert(1)> **unclosed")
  assert.equal(block.kind, "paragraph")
  assert.deepEqual(block.runs, [{ text: "<img src=x onerror=alert(1)> **unclosed", bold: false }])
})


test("a late return, another platform or a different event title is not a rejoin", () => {
  const { first, second } = rejoinPieces()
  // The next day's occurrence of a recurring meeting keeps the same address
  assert.equal(merge.isRejoinOf(first, { ...second, meetingStartTimestamp: "2026-09-24T07:17:00.000Z" }), false)
  assert.equal(merge.isRejoinOf(first, { ...second, meetingStartTimestamp: "2026-09-25T07:17:00.000Z" }), false)
  assert.equal(merge.isRejoinOf({ ...first, meetingSoftware: "Teams" }, { ...second, meetingSoftware: "Teams" }), false)
  assert.equal(merge.isRejoinOf(first, { ...second, meetingTitle: "Meet - Sprint Planning" }), false)
})

test("leaving and rejoining the same meeting code later that day continues the meeting", () => {
  const local = (h, m) => new Date(2026, 8, 23, h, m).toISOString()
  const { first, second } = rejoinPieces()
  const morning = { ...first, meetingStartTimestamp: local(9, 0), meetingEndTimestamp: local(9, 30) }
  // Four hours away, same day, same code
  assert.equal(merge.isRejoinOf(morning, { ...second, meetingStartTimestamp: local(13, 30), meetingUrl: "https://meet.google.com/abc-defg-hij?authuser=2" }), true)
  // A call past midnight is still the same meeting within the window
  const late = { ...first, meetingStartTimestamp: local(23, 0), meetingEndTimestamp: local(23, 50) }
  assert.equal(merge.isRejoinOf(late, { ...second, meetingStartTimestamp: new Date(2026, 8, 24, 0, 20).toISOString() }), true)
})

test("a rejoin within the window survives query changes, code-only titles and a long break", () => {
  const { first, second } = rejoinPieces()
  assert.equal(merge.isRejoinOf(first, { ...second, meetingUrl: second.meetingUrl + "?authuser=1" }), true)
  assert.equal(merge.isRejoinOf(first, { ...second, meetingTitle: "Meet - abc-defg-hij" }), true)
  assert.equal(merge.isRejoinOf(first, { ...second, meetingStartTimestamp: new Date(Date.parse(first.meetingEndTimestamp) + 90 * 60 * 1000).toISOString() }), true)
})

test("rejoining after another meeting concatenates it and makes it the latest export", () => {
  const { first, second } = rejoinPieces()
  const other = { ...first, meetingUrl: "https://meet.google.com/xyz-abcd-efg", meetingStartTimestamp: "2026-09-23T07:17:20.000Z" }
  const meetings = merge.appendOrMergeMeeting([first, other], second)
  assert.equal(meetings.length, 2)
  assert.equal(meetings[0], other)
  assert.equal(meetings[1].meetingStartTimestamp, first.meetingStartTimestamp)
  assert.equal(meetings[1].transcript.length, 2)
  assert.equal(merge.coversStartTimestamp(meetings[1], second.meetingStartTimestamp), true)
  assert.deepEqual(merge.appendOrMergeMeeting(meetings, second), meetings)
})

test("each day of a recurring meeting is filed as its own meeting", () => {
  const { first } = rejoinPieces()
  const nextDay = { ...first, meetingStartTimestamp: "2026-09-24T07:17:00.000Z", meetingEndTimestamp: "2026-09-24T07:40:00.000Z",
    transcript: [{ personName: "Ahmad", timestamp: "2026-09-24T07:18:00.000Z", transcriptText: "New day." }] }
  assert.equal(merge.appendOrMergeMeeting([first], nextDay).length, 2)
})

test("non-Meet addresses preserve meeting IDs in the query", () => {
  const a = "https://teams.live.com/meet?meetingId=111"
  const b = "https://teams.live.com/meet?meetingId=222"
  assert.notEqual(merge.normaliseMeetingUrl(a), merge.normaliseMeetingUrl(b))
})

test("a meeting merged across days is split back into one meeting per occurrence", () => {
  const url = "https://meet.google.com/suy-prih-sfq"
  const block = (timestamp, text) => ({ personName: "Ahmad", timestamp, transcriptText: text })
  const merged = {
    meetingSoftware: "Google Meet", meetingTitle: "Meet - Supply Chain Standup", meetingUrl: url, accountEmail: "a@x.com",
    meetingStartTimestamp: "2026-10-12T07:20:13.268Z", meetingEndTimestamp: "2026-10-14T08:30:15.610Z",
    mergedStartTimestamps: ["2026-10-12T07:27:33.709Z", "2026-10-13T07:28:03.978Z", "2026-10-13T07:36:44.262Z", "2026-10-14T07:23:03.294Z"],
    transcript: [
      block("2026-10-12T07:21:00.000Z", "Monday before the reload."),
      block("2026-10-12T07:30:00.000Z", "Monday after the reload."),
      block("2026-10-13T07:29:00.000Z", "Tuesday."),
      block("2026-10-13T07:40:00.000Z", "Tuesday after a rejoin."),
      block("2026-10-14T07:25:00.000Z", "Wednesday."),
    ],
    chatMessages: [{ personName: "Ahmad", timestamp: "2026-10-13T07:30:00.000Z", chatMessageText: "link" }],
    webhookPostStatus: "new", obsidianPostStatus: "successful", summary: "All three days.", summaryStatus: "successful",
  }
  const untouched = { ...merged, meetingUrl: "https://meet.google.com/xyz-abcd-efg", mergedStartTimestamps: undefined }
  const result = merge.splitInvalidMerges([untouched, merged])
  assert.equal(result.length, 4)
  assert.equal(result[0], untouched)
  const [monday, tuesday, wednesday] = result.slice(1)
  // The first day keeps its start time, and so its note, with only its own content
  assert.equal(monday.meetingStartTimestamp, merged.meetingStartTimestamp)
  assert.deepEqual(monday.mergedStartTimestamps, ["2026-10-12T07:27:33.709Z"])
  assert.equal(monday.transcript.length, 2)
  assert.equal(monday.meetingEndTimestamp, "2026-10-12T07:30:00.000Z")
  // A genuine rejoin inside the merged entry stays joined
  assert.equal(tuesday.meetingStartTimestamp, "2026-10-13T07:28:03.978Z")
  assert.equal(tuesday.transcript.length, 2)
  assert.equal(tuesday.chatMessages.length, 1)
  assert.equal(wednesday.meetingEndTimestamp, merged.meetingEndTimestamp)
  for (const meeting of [monday, tuesday, wednesday]) {
    assert.equal(meeting.obsidianPostStatus, "new")
    assert.equal(meeting.summary, undefined)
  }
  // Recovery still recognises every piece as saved
  for (const start of [merged.meetingStartTimestamp, ...merged.mergedStartTimestamps]) {
    assert.equal(result.some(meeting => merge.coversStartTimestamp(meeting, start)), true)
  }
  // Running it again changes nothing
  const again = merge.splitInvalidMerges(result)
  assert.equal(again.length, 4)
  again.forEach((meeting, index) => assert.equal(meeting, result[index]))
})

test("a repeated sentence after a long absence is kept in both transcript segments", () => {
  const { first, second } = rejoinPieces()
  const next = { ...second, transcript: first.transcript.map(block => ({ ...block, timestamp: "2026-09-23T08:00:00.000Z" })) }
  assert.equal(merge.mergeRejoin(first, next).transcript.length, 2)
})
