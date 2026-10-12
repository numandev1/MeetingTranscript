// Regenerate using demo data: NODE_PATH=<playwright node_modules> node scripts/generate-store-screenshots.cjs build store
const { chromium } = require("playwright"); const path = require("path"); const fs = require("fs")
const build = path.resolve(process.argv[2]); const out = path.resolve(process.argv[3]); const raw = fs.mkdtempSync(path.join(require("os").tmpdir(), "meeting-store-raw-"))
const people = ["Priya Shah", "Carlos Ruiz", "Numan", "Sofia Lind"]
const lines = ["Morning everyone, let's start with the rollout status.", "The staging deploy went out last night and the error rate is flat.", "Good. Can we move the payments migration to Thursday instead?", "Thursday works, but I need the schema review done by Wednesday noon.", "I'll pair with Carlos on that this afternoon.", "One more thing: the Zoom capture regressed after their UI update."]
const tr = (start, n) => Array.from({ length: n }, (_, i) => ({ personName: people[i % 4], timestamp: new Date(Date.parse(start) + i * 47000).toISOString(), transcriptText: lines[i % lines.length] }))
const SUM = "## Summary\nThe rollout is on track and staging is stable. The payments migration moves to Thursday, pending a schema review.\n\n## Decisions\n- Payments migration moves to **Thursday**\n- Zoom capture fix is prioritised this sprint\n\n## Action items\n- [ ] **Numan:** schema review by Wednesday noon\n- [ ] **Carlos:** pair on the migration this afternoon\n- [x] **Priya:** staging deploy"
const rows = [["Product rollout sync", "Google Meet", "successful", "successful", 1], ["Design review: onboarding flow", "Google Meet", "new", "successful", 1], ["1:1 with Priya", "Google Meet", "new", "successful", 0], ["Payments migration sync", "Microsoft Teams", "successful", "successful", 1], ["Customer call — Acme Corp", "Zoom", "new", "new", 0], ["Weekly planning", "Google Meet", "successful", "successful", 1], ["Hiring sync", "Google Meet", "new", "successful", 1]]
const now = Date.parse("2026-10-09T09:30:00Z")
const meetings = rows.map(([t, sw, wh, ob, su], i) => { const start = new Date(now - i * 26 * 3600e3).toISOString(); const m = { meetingSoftware: sw, meetingTitle: t, meetingStartTimestamp: start, meetingEndTimestamp: new Date(Date.parse(start) + (20 + i * 7) * 60e3).toISOString(), transcript: tr(start, 14 + i * 3), chatMessages: [], webhookPostStatus: wh, obsidianPostStatus: ob, accountEmail: "numan@example.com", captionsSeen: true }; if (su) { m.summary = SUM; m.summaryStatus = "successful" } return m }).reverse()
;(async () => {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "meeting-store-profile-"))
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, colorScheme: "light", deviceScaleFactor: 1, args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`] })
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker")
  const id = sw.url().split("/")[2]
  const liveStart = new Date(Date.now() - 18 * 60e3).toISOString()
  await sw.evaluate(async ({ meetings, liveStart, live, SUM }) => {
    await chrome.storage.local.set({ meetings, meetingTabId: 4242, meetingStartTimestamp: liveStart, meetingTitle: "Product rollout sync", meetingSoftware: "Google Meet", transcript: live, liveSummary: { meetingStartTimestamp: liveStart, summary: SUM, createdAt: new Date().toISOString(), blockCount: live.length } })
    await chrome.storage.sync.set({ wantGoogleMeet: true, operationMode: "auto", obsidianEnabled: true, obsidianFolder: "Meetings", obsidianSummaryFolder: "MeetingSummary", participantName: "Numan" })
  }, { meetings, liveStart, live: tr(liveStart, 9), SUM })
  const shot = async (file, w, h, name, after) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); await p.goto(`chrome-extension://${id}/${file}`); await p.waitForTimeout(700); if (after) await after(p); await p.screenshot({ path: path.join(raw, name + ".png") }); await p.close() }
  await shot("meetings.html", 1280, 800, "meetings")
  await shot("meetings.html", 1280, 800, "viewer", async p => { await p.locator(".view-summary-button").first().click(); await p.waitForTimeout(500) })
  await shot("meetings.html#settings-obsidian", 1280, 800, "obsidian", async p => { await p.waitForTimeout(300) })
  await shot("side-panel.html", 400, 700, "sidepanel")
  await shot("popup.html", 360, 540, "popup")
  await ctx.close(); fs.rmSync(dir, { recursive: true, force: true })

  // --- compose ---
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 })
  const img = n => "data:image/png;base64," + fs.readFileSync(path.join(raw, n + ".png")).toString("base64")
  const logo = "data:image/png;base64," + fs.readFileSync(path.join(build, "icon.png")).toString("base64")
  const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
  const canvas = (title, sub, shotHtml) => `<html><body style="margin:0;width:1280px;height:800px;background:linear-gradient(160deg,#EEF0FF 0%,#F7F7F8 60%);font-family:${font};display:flex;align-items:center;justify-content:center;gap:72px;overflow:hidden">
    <div style="width:440px"><img src="${logo}" width="56" style="display:block;margin-bottom:28px"><div style="font-size:40px;font-weight:650;letter-spacing:-0.02em;line-height:1.12;color:#18181B;text-wrap:balance">${title}</div><div style="margin-top:18px;font-size:20px;line-height:1.5;color:#52525B">${sub}</div></div>
    ${shotHtml}</body></html>`
  const frame = (src, w) => `<img src="${src}" width="${w}" style="border-radius:14px;box-shadow:0 24px 60px rgba(30,27,75,.18),0 0 0 1px rgba(30,27,75,.08)">`
  const compose = async (html, name, w = 1280, h = 800) => { await p.setViewportSize({ width: w, height: h }); await p.setContent(html); await p.waitForTimeout(200); await p.screenshot({ path: path.join(out, name) }) }
  fs.copyFileSync(path.join(raw, "meetings.png"), path.join(out, "screenshots", "1-meetings.png"))
  fs.copyFileSync(path.join(raw, "viewer.png"), path.join(out, "screenshots", "2-summary.png"))
  await compose(canvas("Summarise the meeting before it ends", "Follow the live transcript in the side panel, and ask for a summary — or download what has been said — at any point in the call.", frame(img("sidepanel"), 400)), "screenshots/3-live-summary.png")
  fs.copyFileSync(path.join(raw, "obsidian.png"), path.join(out, "screenshots", "4-obsidian.png"))
  await compose(canvas("Switch on the platforms you use", "Google Meet, Microsoft Teams and Zoom. Transcripts are captured from live captions and kept on your device.", frame(img("popup"), 360)), "screenshots/5-popup.png")
  await compose(`<html><body style="margin:0;width:440px;height:280px;background:linear-gradient(150deg,#5B54EE,#3730A3);font-family:${font};display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box;color:#fff">
    <img src="${logo}" width="64" style="margin-bottom:18px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))">
    <div style="font-size:25px;font-weight:650;letter-spacing:-0.015em">MeetingTranscript<wbr>ToObsidian</div>
    <div style="margin-top:8px;font-size:15px;line-height:1.45;color:rgba(255,255,255,.82)">Meet, Teams and Zoom transcripts,<br>filed into your Obsidian vault.</div></body></html>`, "promo-small-440x280.png", 440, 280)
  await b.close()
  fs.rmSync(raw, { recursive: true, force: true })
})()
