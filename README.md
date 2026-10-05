# MeetingTranscriptToObsidian

Private meeting transcripts for Google Meet, Microsoft Teams and Zoom. Everything is captured and stored on your own machine.

> Teams and Zoom support is in beta.

![The meetings page](/assets/screenshot-meetings.png)

<br />

# What it does

- Transcribes meetings from the platform's own live captions, with speaker names
- Captures the meeting chat alongside the transcript
- Saves a text file after every meeting, into a folder you choose
- Summarises a meeting with ChatGPT, using the account you are already signed into — on a button, or automatically as soon as a meeting ends
- Files transcripts and summaries into an Obsidian vault, in per-account folders
- Posts to any webhook, so the transcript can reach whatever tool you use

<br />

# Install

Grab a build from the releases page — no build step needed:

- **[Latest build](../../releases/tag/latest)** — `meetingtranscript-latest.zip`, rebuilt on every push to `main`
- **[Tagged releases](../../releases)** — fixed versions

Then:

1. Unzip the download.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the unzipped folder.

<br />

# Using it

<img src="/assets/screenshot-popup.png" width="360" alt="The extension popup" />

Two recording modes:

- **Automatic** — every meeting is transcribed
- **Manual** — turn captions on yourself when you want a transcript

Both write a text file when the meeting ends. Turn individual platforms on or off in the popup; each one asks for its own permission the first time.

<br />

# Integrations

Everything below is optional and off until you configure it. The extension makes no network requests of its own — it only talks to endpoints you enter.

**Webhooks** — point it at any URL and each finished meeting is posted as JSON. Choose a pre-formatted body for no-code tools, or the raw structure for code. The meetings page documents both shapes.

**Obsidian** — writes each meeting as a markdown note through the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin, with frontmatter, participants and a link between a summary and its transcript. Notes are filed per Google account, so meetings from different accounts stay separate. Requires the plugin's non-encrypted (HTTP) server, because the HTTPS port uses a self-signed certificate that browser extensions cannot accept.

**ChatGPT summaries** — hands the transcript to the ChatGPT web app in a tab of its own and reads the answer back. No API key involved; it uses the session you are already signed into. Turn on **Summarise automatically when a meeting ends** in Settings and you never press anything: the tab opens itself, sends the transcript, saves the summary next to the transcript and files it in Obsidian, and closes again. The tab is in front for the few seconds it takes to type the message — ChatGPT ignores a hidden tab — and you get your place back as soon as the answer starts arriving.

<br />

# Moving between computers

The settings page exports your whole configuration to a file and imports it on another machine. Importing switches Obsidian on and asks for the permissions the imported setup needs.

Transcripts are not included — they stay on the device that recorded them. Exported `.txt` transcripts can be imported back individually if you want them elsewhere.

<br />

# Development

Written in TypeScript, bundled with webpack. The loadable extension is the generated `build/` directory.

```bash
npm install
npm run build      # development build into build/
npm start          # same, in watch mode
npm run check      # type check
npm run zip        # production build + zip/ artifact
```

Then load `build/` via `chrome://extensions` → Developer mode → **Load unpacked**.

Source layout:

- `src/background-script/` — service worker: meeting processing, downloads, webhooks, Obsidian, summaries
- `src/content-scripts/` — caption capture, with one directory per platform
- `src/pages/` — popup, meetings page and side panel
- `src/lib/` — shared types and helpers
- `src/styles/app.css` — the design system shared by every page

<br />

# Privacy

Transcripts are captured and stored in your browser. There is no analytics, no error reporting and no remote configuration — the extension contacts nothing on its own.

Three optional features send data out, each only when you use them:

- **Webhook** — the meeting is posted to the URL you entered, and nowhere else.
- **Obsidian** — notes are written to the Local REST API address you entered, normally your own machine.
- **Summarise** — the transcript is sent to **ChatGPT**, in the browser tab you are signed into, and is therefore subject to OpenAI's terms and data handling. Don't use it for meetings you cannot share with a third party. This is off until you ask for it, and automatic summarising is a separate, second opt-in: turning it on asks you to confirm, because from then on every meeting goes to ChatGPT without a further prompt.

<br />

# Notice

Transcripts come from automatic captions and are not always accurate. They are meant to aid productivity. It is your responsibility to comply with any laws or policies that apply to recording meetings.


