# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MeetingTranscript is a Manifest V3 Chrome extension that scrapes live captions/chat out of Google Meet, Microsoft Teams and Zoom web clients, stores transcripts locally, and downloads them (and optionally POSTs them to a user-configured webhook) when a meeting ends.

The source is TypeScript under `src/`, bundled by webpack into `build/`. **`build/` is the directory Chrome loads** — never edit it, it is wiped on every compile.

## Commands

```bash
npm install
npm run build      # one-off development build into build/
npm start          # same, in watch mode
npm run check      # tsc --noEmit, the only type gate
npm run zip        # production (minified) build + zip/meetingtranscript-<version>.zip for the Web Store
```

- **Load it:** `chrome://extensions` → Developer mode → "Load unpacked" → select `build/`.
- **After editing:** the reload button on the extension card picks up background/UI changes; content-script changes also need a refresh of the meeting tab. Content scripts are *dynamically registered*, so toggling the platform off/on from the popup may be needed too (see below).
- There is no test suite and no linter.
- `npm start` runs a watching webpack, not a dev server. webpack-dev-server is deliberately not used: content scripts run on meet.google.com / teams.microsoft.com / zoom.us, whose CSP blocks scripts and websockets from localhost.
- **Release flow:** bump `version` in both `package.json` and `src/manifest.json`, update the "Extension status: 🟢 OPERATIONAL (vX.Y.Z)" line in `README.md`, work on a `vX.Y.Z` branch, merge to `main` via PR.

## Build wiring

`webpack.config.js` has one entry per emitted bundle, each a thin `src/pages/<Name>/index.ts` wrapper around the real implementation:

| Entry | Emits | Loaded as |
|---|---|---|
| `background` | `background.js` | MV3 module service worker |
| `contentGoogleMeet` / `contentTeams` / `contentZoom` | `content<Platform>.js` | content scripts, registered at runtime |
| `popup` / `meetings` / `sidePanel` | `popup.html` / `meetings.html` / `side-panel.html` + js | extension UI |

HTML templates live next to their entry (`src/pages/*/index.html`) and are emitted by HtmlWebpackPlugin, which injects the script tag — **do not add a `<script src>` to a template**. `src/manifest.json`, `rules.json`, `icon.png` and `icons/` are copied verbatim by CopyWebpackPlugin; the manifest's `version`/`description` are overwritten from `package.json` when npm exposes them.

`@lib/*` resolves to `src/lib/*` — declared in *both* `webpack.config.js` (`resolve.alias`) and `tsconfig.json` (`paths`). Adding an alias means editing both.

## Architecture

### Three layers, chrome.storage is the bus

1. **Content scripts** (`src/content-scripts/`) run in the meeting tab, observe the captions DOM via `MutationObserver`, and continuously overwrite `chrome.storage.local` with the in-progress meeting.
2. **Background service worker** (`src/background-script/`) owns everything after a meeting ends: it moves the in-progress meeting into the `meetings` array (last 10 kept), downloads the `.txt`, and posts the webhook.
3. **UI pages** (`src/pages/Popup`, `Meetings`, `SidePanel`) read `chrome.storage` and send `ExtensionMessage`s to the background script.

Nothing is passed directly between content script and UI pages; state moves through `chrome.storage.local`/`.sync` plus `chrome.runtime.sendMessage`.

### Content scripts are registered at runtime, not in the manifest

`src/manifest.json` declares **no** `content_scripts`. Only `https://meet.google.com/*` is a required host permission; Teams and Zoom hosts are `optional_host_permissions`. `src/background-script/config.ts → PLATFORM_CONFIGS` is the single source of truth for each platform's script id, bundle list, match patterns and extra permissions; `platforms.ts` requests permissions, then calls `chrome.scripting.registerContentScripts()`. Consequences:

- **The `js` array in `PLATFORM_CONFIGS` holds webpack output filenames**, so it must stay in sync with the entry names in `webpack.config.js`. Renaming an entry without updating the config silently stops injection.
- `wantGoogleMeet` / `wantTeams` / `wantZoom` in `chrome.storage.sync` record *intent*; `reRegisterContentScripts()` re-applies them on install/update and on `chrome.permissions.onAdded`.
- Zoom additionally needs the `declarativeNetRequest` ruleset (`src/rules.json`, shipped **disabled**) which rewrites `zoom.us/j/<id>` links to the web client — enabled/disabled alongside the Zoom content script.

### Per-platform structure

Each platform directory under `src/content-scripts/` is the same three files:

- `config.ts` — a `SELECTORS_<PLATFORM>` object. **All DOM coupling lives here**; this is what breaks when a vendor ships a UI change, and it's the first place to look for a "transcripts stopped working" bug.
- `utils.ts` — platform-specific notification banner, person-name extraction.
- `index.ts` — lifecycle (detect meeting start, wire observers, detect meeting end) and the platform's `transcriptMutationCallback*`. It exports an init function that the `src/pages/Content*/index.ts` entry calls; the entry is the only thing that runs on load.

Lifecycle differences: Google Meet's init runs once on injection (the SPA persists per meeting), while **Teams and Zoom poll every 2 s** for a lobby/URL signal and re-run their init per meeting, guarded by an `isXInjected` flag. Zoom's real UI lives inside an iframe (`#webclient`), so its selectors are queried against `iframe.contentDocument`.

### Shared content-script machinery (`common-utils.ts`)

- `createContentScriptState(meetingSoftware, platform)` returns a fresh `ContentScriptState`; every platform threads that one `state` object through its functions instead of using module-level mutable state.
- `startTranscriptMonitor(state, transcriptMutationCallback)` is a flat 2 s poll that (re)attaches the `MutationObserver` whenever the captions node appears, is replaced, or is disconnected — this is what survives users toggling captions off/on. It flushes the buffer before re-attaching. **The platform callback is passed in as an argument on purpose**: `common-utils` must not import the platform modules that import it.
- Transcript text accumulates in `state.stateTranscriptBlock` (a per-speaker buffer) and is only appended to `state.transcript` by `pushBufferToTranscript()` when the speaker changes, the node is replaced, or the meeting ends.
- `overWriteChromeStorage(state, keys, sendDownloadMessage)` is the only writer to storage from content scripts; passing `true` for the third arg is what fires the `meeting_ended` message.

### Delivery targets

`processLastMeeting()` fans out to up to three independent targets in parallel, each with its own enable flag and its own failure handling:

| Target | Enabled by | Retry |
|---|---|---|
| `.txt` download | `autoDownloadFileAfterMeeting` | meetings table download button |
| Webhook POST | `autoPostWebhookAfterMeeting` + `webhookUrl` | `webhookPostStatus` + post button |
| Obsidian note | `obsidianEnabled` | `obsidianPostStatus` + save/retry button |

Then, sequentially after those have settled, an optional fourth: a ChatGPT summary when `autoSummarizeAfterMeeting` is on (see below).

Obsidian (`src/background-script/obsidian.ts`) `PUT`s markdown to the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin at `http://127.0.0.1:27123/vault/<folder>/<Title> <YYYY-MM-DD>.md` with a Bearer key. Two constraints drive that design:

- **Plain HTTP, not HTTPS.** The plugin's 27124 port serves a self-signed certificate, which `fetch()` in a service worker rejects with no way to opt out. The user must enable the plugin's non-encrypted server.
- **The API key lives in `chrome.storage.local`, not `sync`** — a credential must not be replicated to the user's Google account, which would contradict the extension's privacy claim. Every other Obsidian setting syncs normally.

A `TypeError` from `fetch` is mapped to error code `019` ("is Obsidian running?") rather than the generic `017`, because an unreachable app — not a bad request — is overwhelmingly the common failure: Obsidian is frequently closed at the moment a meeting ends. That is also why Obsidian runs *alongside* the `.txt` download rather than replacing it.

### ChatGPT summaries

`src/background-script/summarizer.ts` drives the ChatGPT **web app** (there is no API key) via `chrome.scripting.executeScript`, then files the result in the Obsidian summary folder. Six things are load-bearing and each was a real failure before it was fixed:

- **The tab has to be in front to submit.** `execCommand("insertText")` needs the *document* focused, which only the active tab of a focused window has; opened hidden, the insert silently does nothing and the run completes only if the user switches to the tab by hand. So `openChatGptTab` opens the tab active, remembers what was in front, and `restoreFocus` hands the user's place back the moment answer text appears (or after `FOREGROUND_GRACE_MS`, so a failure does not squat on the screen). Reading the answer needs no focus at all — that is the service worker polling the DOM.
- **`world: "MAIN"` is mandatory.** From an isolated world, `execCommand("insertText")` mutates the DOM without ProseMirror's model seeing it. The composer then still reads empty, and since the send button is a `type="submit"` inside a form, clicking it performs a native GET to `chatgpt.com/?prompt-textarea=` that navigates the page away instead of sending.
- **Verify the composer holds text before clicking send**, for the same reason — an empty submit is destructive, not a no-op.
- **Wait for `tabs.onUpdated` → `complete`.** `tabs.create`/`tabs.update` call back when navigation *starts*, so injecting immediately races the load.
- **Completion is signalled by an end marker in the reply**, not by the DOM. The stop button disappears while text is still streaming, so a stability heuristic alone truncates answers mid-sentence. **An answer that never finished is never stored**: `readResponse` returns `{ text, complete }`, and only a marker or `isStableAnswer` holding for `STABLE_POLLS_REQUIRED` polls counts as complete. Running out of time is a failure, reported with how much arrived. Returning the partial text and letting the caller store it is how an 80-block meeting came to be filed, successfully, as a 46-character summary that stopped mid-word.
- **A failed attempt keeps the previous summary, and the UI says so.** Clearing it would destroy a good summary from an earlier run, so it stays — but the row then shows a `stale` badge and the viewer a warning. Without that, a half-written summary left behind by a failed retry reads as the current one, which is precisely how a 46-character summary sat unnoticed on a 24-minute meeting.
- **`isStableAnswer` requires generation to have been *seen*.** A lull before ChatGPT starts answering is otherwise indistinguishable from a finished answer, so the first burst of text gets accepted as the whole summary. The tab is also pinned with `autoDiscardable: false`, because Chrome evicts hidden tabs under memory pressure and a discarded tab looks exactly like an answer that stopped growing.

The answer is requested inside a fenced code block and read from `pre code`, because the rendered message flattens `## Summary` to `Summary`.

**The block is preferred only when it actually holds text.** `pickAnswerText` in `src/lib/summary-text.ts` makes that choice, and it sits outside the injected function so it can be tested. Choosing with `??` was a live bug: ChatGPT renders the opening fence the moment the model emits it, so `pre code` routinely exists and is empty, `""` is not nullish, and the fallback to the message never fired. The reader then saw nothing for the full `RESPONSE_TIMEOUT_MS` and reported 021 against a summary that was plainly on screen — intermittently, depending on how that run happened to render. Both readings are taken with `textContent`, which needs no layout, since the tab is deliberately not in front by then.

A dedicated tab is opened per summary — never the user's own ChatGPT tab, which would discard whatever conversation they had open — and it is **always closed, on every path**, from a `finally`. Failure used to leave the tab open so the cause was visible, which does not survive the automatic run: nobody is watching it, so each failure just left another ChatGPT tab behind and the cause still had to be guessed. `describeFailure()` now reads those signals (signed out, usage limit, an alert, prompt never sent, answer never started) off the page before it closes, and they travel in the error message and into `recentErrors`.

`summarizeAndFileMeeting()` is the single entry point: it summarises, then saves the summary file and the vault note, each under its own setting. Both the Summarise button and the automatic run after a meeting go through it, so a summary is filed the same way however it was triggered — the follow-ups are bonuses and can never turn a stored summary into a reported failure.

With `autoSummarizeAfterMeeting` on, `processLastMeeting()` runs it **after** the download/webhook/Obsidian fan-out has settled, never inside it: it drives a real tab for up to three minutes, and the transcript must already be filed before anything that slow runs. A failure there resolves the meeting-end path anyway and is recorded in `recentErrors` — nobody clicked anything, so there is no dialog to report it in, and silence is the failure this list exists to prevent.

The setting is off until the user turns it on, and the toggle itself is the consent moment: it confirms, then requests the `chatgpt.com` host permission from inside the change handler (a user gesture), and unticks itself if either is refused rather than promising something that cannot happen.

`meetingTabId` deliberately stays `"processing"` for the whole summary. That defers an extension update that would otherwise reload the service worker mid-run and lose the answer. The polling also **is** the service worker's keepalive: a `chrome.*` call every second holds it past its idle timeout, which is why the tab-load wait polls `chrome.tabs.get` instead of sleeping on one long `setTimeout` — the automatic run has no open message port to keep the worker up.

This is the most fragile part of the codebase: it depends on selectors in a page nobody here controls. `#prompt-textarea`, `button[data-testid="send-button"]`, `button[data-testid="stop-button"]` and `[data-message-author-role="assistant"]` are the four to re-check when summaries stop working.

### Importing transcript files

`src/lib/transcript-import.ts` parses an exported `.txt` back into a `Meeting`, so files from another computer or from before a reinstall re-enter the normal pipeline (summarise, Obsidian, webhook).

- It reads the **file name** for title, platform and start time, because the body only carries per-block times. Chrome's `" (1)"` uniquify suffix is stripped first, otherwise the whole timestamp ends up stranded in the meeting title.
- Timestamp order (`dd/mm` vs `mm/dd`) is **locale-dependent** in the exporter's own output and cannot be recovered with certainty. Day-first is assumed, a first value above 12 proves the order, and block times are display-only, so a mismatch costs ordering at worst.
- Parsing is **forgiving on purpose**: a file with no recognisable headers still imports as one block. Only a file with no content at all is rejected.
- Re-importing the same file **updates** the existing meeting rather than duplicating it, and keeps any summary the entry already earned.
- The 10-meeting cap still applies, and the UI **says so** when an import pushes something out, rather than letting a meeting disappear silently.

### Saving from the viewer

The transcript dialog's Obsidian and Download actions both **follow whichever note is on screen**: in summary mode they target the summary (`post_summary_obsidian_at_index`, the summary file), otherwise the transcript. One control per job rather than four buttons, matching how the row actions already behave.

### Vault layout

Every note is filed at **parent / account / note**, and the account level is always present — `unknown-account` when the address cannot be read, which is every Teams and Zoom meeting and anything recorded before account detection existed.

Uniform depth is the point: a note that sometimes sits one level up and sometimes two makes vault-side searches, Bases and templates conditional on something the user cannot see. `withAccountSubfolder` therefore substitutes the fallback both before sanitising (an empty address would otherwise mean "the root") and after (an address that sanitises away to nothing would collapse the level).

### Retention only touches the extension's copy

`trimMeetings` in `src/lib/retention.ts` takes meetings and returns meetings. It has no access to the vault, the download folder or the webhook, which is what makes the setting's promise true rather than merely intended: raising or lowering the limit can only affect the copy the browser holds.

**Nothing in this extension deletes a vault note.** Not retention, not the per-meeting delete button, not a re-sync. The vault is the permanent record and the meetings list is a working copy of the last N; the two have deliberately different lifetimes. A user who wants a note gone deletes it in Obsidian.

That is a product decision, not an oversight — so if a future change needs to remove a note, it needs a deliberate, separately confirmed action of its own, never a side effect of a cleanup setting or a list operation.

### Backfilling the vault

`syncAllMeetingsToObsidian()` writes every stored meeting, and any summaries, in one action. It runs **sequentially**: the target is a plugin inside the user's editor, and concurrent writes gain nothing while making a partial failure impossible to report accurately. It also **stops early on error 019** (vault unreachable), since that will fail for every remaining meeting too.

Note names lead with the timestamp (`2026-09-14 0930 Standup`) because Obsidian's file explorer sorts alphabetically by file name. With the title first, a new meeting lands wherever its title falls alphabetically instead of at the end of the folder. The time is part of the name so several meetings in one day still order correctly.

**The bulk sync does not overwrite a note that already exists.** A note in the vault may carry the user's own work — ticked action items, added context — and this action exists to backfill, not to republish. It reports how many it skipped. The per-meeting Obsidian button still overwrites, because that is an explicit choice about one note.

Re-running is safe by design — notes are addressed by title and date, so a second run replaces the same notes rather than duplicating them, which makes this usable as a repair action.

### Moving a setup between machines

`src/lib/settings-transfer.ts` exports every synced setting to a JSON file and reads it back. `TRANSFERABLE_SYNC_TYPES` maps each setting to the type it holds and is the single source both directions use (`TRANSFERABLE_SYNC_KEYS` is derived from it), so adding a setting cannot leave export and import out of step. The type is recorded next to the name because import validates each value against *that setting's* type — a bare list of names cannot express that a number in a boolean's place is a corrupt file, and storing it would leave a checkbox in a state the UI cannot render.

Two rules are deliberate, not incidental:

- **The Obsidian API key is opt-in.** It lives in `chrome.storage.local` precisely so it never leaves the device, so putting it in a file is a choice the user makes per export, and the UI says the file then holds a credential.
- **Import switches Obsidian on** (`withObsidianEnabled`) even when the exporting machine had it off, and fills in any missing folder. A machine receiving a configuration is being set up to file notes.

A settings file is untrusted input — it arrives from another machine, possibly another version. `parseSettingsFile` therefore allowlists against `TRANSFERABLE_SYNC_KEYS` and type-checks each value, so an unknown or wrong-typed key is dropped rather than written to storage.

### Meeting-end paths

A meeting is finalised either by the content script's call-end click handler (`meeting_ended` message) **or** by `chrome.tabs.onRemoved` matching the stored `meetingTabId`. `meetingTabId` is a three-state flag: a tab id (meeting live), `"processing"` (post-processing; suppresses the double-download and defers extension updates), or `null` (idle). `chrome.runtime.onUpdateAvailable` sets `isDeferredUpdatedAvailable` rather than reloading mid-meeting; `clearTabIdAndApplyUpdate()` applies it afterwards.

`recoverLastMeeting()` runs at the *start* of each meeting (raced against a timeout — 15 s on Meet, 2 s on Teams/Zoom) and salvages a previous meeting whose `meetingStartTimestamp` never made it into `meetings`. The meetings page exposes the same thing as a manual button.

### Types

`src/lib/types.ts` is the single shared type module (`src/lib/paths.ts` holds the folder-path sanitiser shared by the download and Obsidian targets) (`ResultLocal`, `ResultSync`, `ExtensionMessage`, `ExtensionResponse`, `Meeting`, `ContentScriptState`, …). New storage keys and message types belong there. `chrome.storage` callbacks hand back `{ [key: string]: any }`, so the codebase narrows them with a `Partial<>` cast — storage may genuinely be empty, which is what `Partial` encodes:

```ts
chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
    const resultLocal = resultLocalUntyped as Partial<ResultLocal>
    ...
})
```

### Error convention

Failures reject with `{ errorCode, errorMessage }` (`ErrorObject`), and codes are centrally documented in the comment block at the bottom of `src/lib/types.ts` (001–008 content script, 009–016 background/recovery). When adding a failure mode, allocate the next code there and keep the `@throws error codes:` doc comments on the throwing functions in sync — callers branch on these codes (e.g. `013`/`014` are treated as "nothing to recover", not errors).

### No third-party endpoints

The extension contacts **only** what the user configured: their webhook URL, and their own Obsidian Local REST API. There is no analytics, no error reporting and no remote configuration.

That is a deliberate change from the upstream project, which this is forked from. It previously:

- fetched a per-platform status document from the original author's site on every meeting, which acted as a **remote kill switch** — a non-200 there, or a `minVersion` above the installed build, disabled capture for every user;
- posted error codes and a per-meeting ping (version, platform, webhook-enabled) to that author's Google Apps Script endpoints;
- hotlinked the in-meeting banner logo from the same site.

A fork must not depend on another project's infrastructure to keep working, and a privacy-focused extension should not announce every meeting to a third party. `checkExtensionStatus()` now just sets the banner text, `logError()` reports to the console, and the logo is bundled (exposed via `web_accessible_resources` so the meeting page can load it).

Keep it that way: adding an endpoint here contradicts the claim the README makes to users.

## Code style

Matching the surrounding code matters more than any of this, but for reference: no semicolons in `src/**.ts` (the webpack/utils config files are semicolon'd CommonJS), 4-space indent except the Teams and Popup modules which use 2, double quotes, `function` declarations over arrow functions at top level, and callback-style `chrome.*` APIs wrapped in hand-rolled `Promise`s rather than `async/await`.
