# Chrome Web Store submission — MeetingTranscriptToObsidian

Everything the developer dashboard asks for, in the order it asks. Paste each block into the matching field.

Upload: `zip/meetingtranscripttoobsidian-<version>.zip` (run `npm run zip`).

---

## Store listing tab

**Name** (from the manifest): MeetingTranscriptToObsidian

**Summary** (manifest description, 132 characters max):

> Meeting transcripts from Google Meet, Teams and Zoom, saved to your Obsidian vault. Private and open source.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
Turn every Google Meet, Microsoft Teams and Zoom call into a clean transcript — saved on your own computer and filed straight into your Obsidian vault.

MeetingTranscriptToObsidian reads the meeting's own live captions, so there is no bot joining your call and no audio leaving your machine. When the meeting ends, the transcript is saved where you want it.

WHAT IT DOES
• Transcribes meetings from live captions, with speaker names
• Captures the meeting chat alongside the transcript
• Saves a text file after every meeting, into a folder you choose
• Files transcripts into Obsidian as markdown notes, sorted by date and per account
• Summarises meetings with ChatGPT in your own signed-in account — on a button, automatically when a meeting ends, or mid-meeting with "Summarise so far"
• Live side panel: follow the transcript as it is spoken
• Posts transcripts to any webhook (n8n, Zapier, Google Docs and more)

PRIVATE BY DESIGN
• Transcripts are stored only on your device
• No account, no analytics, no tracking, no servers of ours
• Data only goes where you send it: your Obsidian app, your webhook, or ChatGPT when you ask for a summary
• Open source — read every line on GitHub

HOW TO USE
1. Click the extension icon and turn on the platforms you use (Teams and Zoom are in beta).
2. Join a meeting. Captions are switched on for you in Automatic mode.
3. When the meeting ends, find it on the Meetings page — transcript, summary, and everything already saved.

OBSIDIAN SETUP
Install the Local REST API community plugin in Obsidian, enable its non-encrypted (HTTP) server, and paste its API key into Settings → Obsidian. Use "Test connection" to check.

Teams and Zoom support is in beta.
```

**Graphic assets** (all in `store/`):

| Field | File |
| :--- | :--- |
| Store icon (128×128) | `store/icon-128.png` |
| Screenshots (1280×800) | `store/screenshots/1-meetings.png` … `4-popup.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |

**Official URL / homepage:** https://github.com/numandev1/MeetingTranscript

**Support URL:** https://github.com/numandev1/MeetingTranscript/issues

---

## Privacy practices tab

**Single purpose:**

```
Captures the live captions of the user's Google Meet, Microsoft Teams and Zoom meetings as transcripts and saves them where the user chooses: a text file, the user's Obsidian vault or the user's webhook, optionally with a ChatGPT summary made in the user's own account.
```

### Permission justifications

**storage**
```
Stores the user's meeting transcripts and summaries locally on their device, and the user's settings (folders, webhook URL, summary prompt).
```

**downloads**
```
Saves each meeting's transcript and summary as a text file into a folder the user chooses inside their Downloads folder.
```

**scripting**
```
Registers the caption-reading script for Microsoft Teams and Zoom only after the user turns that platform on, and removes it when they turn it off. When the user asks for a summary, injects a script into a ChatGPT tab the extension opens, to submit the transcript and read the answer back.
```

**declarativeNetRequestWithHostAccess**
```
When the user turns Zoom on, redirects zoom.us/j/<meeting-id> links to Zoom's web client, the only Zoom client whose captions an extension can read. The ruleset ships disabled and is enabled only alongside Zoom support.
```

**sidePanel**
```
Shows the live transcript of the meeting in progress in Chrome's side panel, where the user can also summarise or download it before the meeting ends.
```

**notifications** (optional permission)
```
Requested when the user turns a meeting platform on or sets up a webhook. Confirms that a platform was enabled (and that open meeting pages need a refresh), and tells the user when a transcript could not be delivered to their webhook, so a failed delivery is not silent.
```

**Host permission justification:**
```
meet.google.com: reads the live captions and meeting details of Google Meet calls the user attends.
chat.google.com: reads the in-meeting chat, which Google Meet renders inside a chat.google.com frame.
Optional, requested only when the user turns the platform on: Microsoft Teams and Zoom domains, to read those meetings' captions.
Optional *://*/*: never granted wholesale. It lets the extension ask, at the moment the user configures it, for the one specific origin they chose: their webhook's host, their local Obsidian address (127.0.0.1), or chatgpt.com for summaries.
```

**Are you using remote code?** No. All code is bundled in the package.

### Data usage

Check these boxes — the extension handles them:

- [x] **Personally identifiable information** — names of meeting participants, and the user's Google account email (used only to file notes per account)
- [x] **Personal communications** — meeting transcripts and chat messages
- [x] **Website content** — caption text read from the meeting page

Leave the rest unchecked (health, financial, authentication, location, web history, user activity).

Certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/numandev1/MeetingTranscript/blob/main/PRIVACY.md

---

## Distribution tab

- **Visibility:** Public (or Unlisted to test with a link first)
- **Regions:** All regions
