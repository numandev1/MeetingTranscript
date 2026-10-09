# Privacy policy — MeetingTranscriptToObsidian

_Last updated: 10 October 2026_

MeetingTranscriptToObsidian turns the live captions of your Google Meet, Microsoft Teams and Zoom meetings into transcripts and saves them where you choose. It is built so that your meetings stay yours.

## What the extension handles

- **Meeting content:** caption text, speaker names, meeting chat messages, meeting titles and start/end times.
- **Account address:** the email address of the Google account a Meet meeting was attended from, used only to file notes into a per-account folder.
- **Your settings:** your name for transcripts, folder names, webhook URL, summary prompt and similar preferences.
- **Obsidian API key:** if you enter one.

## Where it is stored

- Transcripts, summaries, the account address and the Obsidian API key are stored **only on your device**, in the browser's local extension storage.
- Your settings (not your meetings and not the API key) are stored in Chrome's synced extension storage, so they follow your Chrome profile if you use Chrome Sync.
- Text files you download are saved to your computer's Downloads folder.

## Where it is sent

The extension makes **no network requests of its own**. There is no analytics, no tracking, no error reporting and no remote configuration. Data leaves your device only to destinations **you** configure or trigger:

| Destination | When | What is sent |
| :--- | :--- | :--- |
| Your webhook URL | After each meeting, if you set a webhook up | The meeting's transcript, chat and details |
| Your Obsidian app (on your own computer, via the Local REST API plugin) | After each meeting, if you turn Obsidian on | The meeting as a markdown note, and its summary |
| ChatGPT (chatgpt.com), in your own signed-in account | Only when you click Summarise, or turn on automatic summaries | The meeting transcript and your summary prompt. OpenAI's terms and privacy policy apply to what is sent there. |

Each destination needs a permission that Chrome asks you to grant the first time, for that one site only.

## What is never done

- Your data is never sold or transferred to third parties, other than the destinations above that you configure.
- Your data is never used for advertising, profiling or creditworthiness, or for any purpose unrelated to saving your meeting transcripts.
- No code is loaded from remote servers; everything the extension runs ships inside it.

## Deleting your data

Delete meetings individually from the extension's Meetings page, or remove the extension to erase everything it stored. Removing the extension does not touch files you downloaded, notes in your Obsidian vault, or anything already sent to your webhook — delete those where they live.

## Contact

Questions or concerns: muhammadnuman70@gmail.com, or open an issue at https://github.com/numandev1/MeetingTranscript/issues
