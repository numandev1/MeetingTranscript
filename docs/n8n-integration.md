# Send transcripts anywhere with n8n

[n8n](https://n8n.io) is an automation tool that can take each meeting from MeetingTranscriptToObsidian and pass it to hundreds of other apps: Notion, Slack, Google Sheets, a database, an email to yourself. You build the flow once; every meeting runs through it.

You need an n8n instance: n8n Cloud, or a self-hosted one that the browser can reach.

## 1. Add a Webhook trigger

1. In n8n, create a new workflow.
2. Add a **Webhook** node as the trigger and set:
   - **HTTP Method:** `POST`
   - **Path:** anything, for example `meeting-transcript`
   - **Respond:** *Immediately*
3. Copy the **Production URL** shown on the node.

Use the production URL, not the test one: the test URL only listens while the editor is open and waiting.

## 2. Connect the extension

1. Open the extension's **Settings → Webhook**.
2. Paste the production URL into **Webhook URL** and click **Save**, then allow the permission Chrome asks for.
3. Choose a request body:
   - **Simple** — transcript and chat arrive as ready-to-read text. Best for sending to Notion, email or a document.
   - **Advanced** — transcript and chat arrive as lists, one entry per speaker turn with its own timestamp. Best for splitting, filtering or storing rows.

## 3. What arrives

With the **Simple** body, the Webhook node's output looks like this:

```json
{
  "webhookBodyType": "simple",
  "meetingSoftware": "Google Meet",
  "meetingTitle": "Team meeting",
  "meetingStartTimestamp": "01/15/2024, 10:00 AM",
  "meetingEndTimestamp": "01/15/2024, 11:00 AM",
  "transcript": "Priya (01/15/2024, 10:00 AM)\nHi everyone!\n\nCarlos (01/15/2024, 10:01 AM)\nHello Priya!\n\n",
  "chatMessages": "Mohammed (01/15/2024, 10:05 AM)\nCan you share the slides?\n\n"
}
```

With **Advanced**, `transcript` is a list of `{ personName, timestamp, transcriptText }` and `chatMessages` a list of `{ personName, timestamp, chatMessageText }`, with ISO timestamps.

In later nodes, refer to fields as `{{ $json.body.meetingTitle }}`, `{{ $json.body.transcript }}` and so on.

## 4. Add what happens next

Some starting points:

- **Notion:** a *Notion → Create database page* node, with the title from `meetingTitle` and the transcript as page content.
- **Slack:** a *Slack → Send message* node posting `meetingTitle` and a link, or the first lines of the transcript.
- **Google Sheets:** with the Advanced body, a *Split Out* node on `body.transcript`, then *Google Sheets → Append row* to log one row per speaker turn.
- **Email:** a *Send Email* node that sends the Simple transcript to yourself.

Activate the workflow with the toggle in the top bar.

## 5. Try it

On the **Meetings** page, click the webhook icon on any meeting. The execution appears under **Executions** in n8n, and the meeting shows a green **Webhook** badge.

## If it does not work

- **"Webhook failed" on the meeting:** check the workflow is **active** and that you used the production URL.
- **Self-hosted n8n:** the address must be reachable from your browser. `localhost` works if n8n runs on the same computer.
- **Nothing in later nodes:** the extension's data sits under `body` in the Webhook node's output, so use `$json.body.…` rather than `$json.…`.
