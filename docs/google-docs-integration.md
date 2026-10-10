# Send transcripts to Google Docs

Every finished meeting becomes its own Google Doc in your Drive, created by a small Google Apps Script that you own. Nothing passes through anyone else's server: the extension posts the transcript straight to your script, and your script writes the Doc.

Takes about five minutes. You need a Google account; no coding.

## 1. Create the script

1. Open [script.google.com](https://script.google.com) and click **New project**.
2. Name it, for example *Meeting transcripts*.
3. Delete everything in the editor and paste this:

```js
// Receives a meeting from MeetingTranscriptToObsidian and saves it as a Google Doc.
// Optional: put a Drive folder ID here to file the Docs there; leave empty for My Drive.
const FOLDER_ID = ""

function doPost(e) {
  const meeting = JSON.parse(e.postData.contents)

  const title = `${meeting.meetingTitle || "Meeting"} — ${formatDate(meeting.meetingStartTimestamp)}`
  const doc = DocumentApp.create(title)
  const body = doc.getBody()

  body.appendParagraph(meeting.meetingTitle || "Meeting").setHeading(DocumentApp.ParagraphHeading.HEADING1)
  body.appendParagraph(
    `${meeting.meetingSoftware || "Meeting"} · ${formatDate(meeting.meetingStartTimestamp)} to ${formatDate(meeting.meetingEndTimestamp)}`
  ).setItalic(true)

  body.appendParagraph("Transcript").setHeading(DocumentApp.ParagraphHeading.HEADING2)
  body.appendParagraph(asText(meeting.transcript, "transcriptText") || "No speech was captured.").setItalic(false)

  const chat = asText(meeting.chatMessages, "chatMessageText")
  if (chat) {
    body.appendParagraph("Chat").setHeading(DocumentApp.ParagraphHeading.HEADING2)
    body.appendParagraph(chat)
  }

  doc.saveAndClose()
  if (FOLDER_ID) {
    DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID))
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, url: doc.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON)
}

// The "simple" webhook body sends text; the "advanced" one sends a list of entries.
function asText(value, textField) {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  return value
    .map(entry => `${entry.personName} (${formatDate(entry.timestamp)})\n${entry[textField]}`)
    .join("\n\n")
}

// Advanced bodies carry ISO timestamps; simple bodies are already readable.
function formatDate(value) {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "d MMM yyyy, HH:mm")
}
```

4. Click **Save** (the disk icon).

## 2. Publish it as a web app

1. Click **Deploy → New deployment**.
2. Next to *Select type*, click the gear and choose **Web app**.
3. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
   *Anyone* only means the extension can call it without signing in. The address is long and unguessable, and the script can do nothing except create Docs in your Drive.
4. Click **Deploy**, then **Authorize access**, and allow it to manage your Docs (and Drive, if you set a folder).
5. Copy the **Web app URL**. It ends in `/exec`.

## 3. Connect the extension

1. Open the extension's **Settings → Webhook**.
2. Paste the Web app URL into **Webhook URL** and click **Save**. Chrome asks to allow the extension to reach `script.google.com`; allow it.
3. Leave **Post the transcript to the webhook after each meeting** ticked.

Either request body works: **Simple** gives the cleanest Doc.

## 4. Try it

On the **Meetings** page, click the webhook icon on any meeting. A new Doc appears in your Drive within a few seconds, and the meeting shows a green **Webhook** badge.

## If it does not work

- **"Webhook failed" on the meeting:** open the script, click **Executions** on the left, and open the failed run to see why.
- **You changed the script:** a running deployment keeps the old code. Use **Deploy → Manage deployments → Edit → Version: New version** to update it while keeping the same URL.
- **Docs land in My Drive:** set `FOLDER_ID` to the part of a folder's address after `/folders/`, then deploy a new version.
