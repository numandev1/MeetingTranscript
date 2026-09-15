# MeetingTranscript
Simple Google Meet transcripts. Private and open source. 
> Teams and Zoom transcripts in beta. <a href="https://github.com/numandev/transcriptonic/wiki/Zoom-and-Teams-beta-testing" target="_blank">Learn
          more</a>.

![marquee-large](/assets/marquee-large.png)

Extension status: 🟢 OPERATIONAL (v3.4.3)

<br />
<br />



# Demo
View video on [YouTube](https://www.youtube.com/watch?v=ARL6HbkakX4)

![demo](/assets/demo.gif)


<br />
<br />


# Installation
<a href="https://chromewebstore.google.com/detail/ciepnfnceimjehngolkijpnbappkkiag" target="_blank">
    <img src="https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png" />
</a>

<br />
<br />

# How to use MeetingTranscript
![screenshot-2](/assets/screenshot-2.png)
MeetingTranscript has two modes of operation.

**In both modes, transcript will be downloaded as a text file at the end of each meeting.**

- **Auto mode:** Automatically records transcripts for all meetings
- **Manual mode:** Switch on MeetingTranscript by clicking on captions icon in Google Meet (CC icon)


<br />
<br />

# Integrating MeetingTranscript with other tools using webhooks
You can integrate MeetingTranscript with any tool that accepts data from a webhook. Refer the "Set up webhooks" page in the extension for details about the webhook body.
- [Google Docs integration guide](https://github.com/numandev/transcriptonic/wiki/Google-Docs-integration-guide?utm_source=readme)
- [n8n integration guide](https://github.com/numandev/transcriptonic/wiki/n8n-integration-guide?utm_source=readme)

<br />
<br />

# FAQs

**1. Can I change the language of the transcript?**

Yes. MeetingTranscript picks up the output of Google Meet captions. Google Meet captions supports variety of languages that you can choose from. Click the settings icon when captions start showing and change the language.

**2. I did not get any transcript at the end of the meeting.**

This could happen when:
1. New errors caused by Google Meet updates
2. Any unexpected events like network drop, browser crashes etc.

When this happens, it might be possible to recover the transcript, but recovery should be done before starting another meeting.
- Open the extension and click on "last 10 meetings". Click on "Recover last meeting" button present after the table.
- MeetingTranscript will also attempt to auto-recover any missed transcripts, just before a new meeting starts.

<br />
<br />

# Development

MeetingTranscript is written in TypeScript and bundled with webpack. The loadable extension is the generated `build/` directory, not `src/`.

```bash
npm install
npm run build      # development build into build/
npm start          # same, in watch mode
npm run check      # type check (tsc --noEmit)
npm run zip        # production build + zip/ artifact for the Chrome Web Store
```

Then load `build/` via `chrome://extensions` → Developer mode → **Load unpacked**.

Source layout:

- `src/background-script/` — MV3 service worker: meeting post-processing, downloads, webhooks, content-script registration
- `src/content-scripts/` — shared caption-capture machinery plus one directory per platform (`google-meet`, `teams`, `zoom`); each holds `config.ts` (DOM selectors), `utils.ts` and `index.ts`
- `src/pages/` — webpack entry points and the HTML for the popup, meetings page and side panel
- `src/lib/types.ts` — shared types and the error-code reference

<br />
<br />

# Privacy policy
MeetingTranscript Chrome extension does not collect any information from users in any manner, except anonymous errors and transcript download timestamp. All processing/transcript storage happens within the user's Chrome browser and does not leave the device, unless you configure a webhook and choose to post data to your webhook URL.

<br />
<br />

# Notice
The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.

<br />
<br />
