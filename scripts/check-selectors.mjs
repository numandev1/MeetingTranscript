#!/usr/bin/env node
/**
 * Checks the DOM selectors this extension depends on against a live meeting.
 *
 * Four vendors' markup is load-bearing and nothing else verifies it: a renamed class or
 * ligature is invisible until a user loses a transcript. Run this before a release with
 * a meeting open on each platform.
 *
 *   node scripts/check-selectors.mjs
 *   node scripts/check-selectors.mjs --json
 *
 * Chrome must be running with remote debugging enabled. The browser endpoint is read
 * from the profile's DevToolsActivePort file, because Chrome 144+ no longer serves the
 * /json/list HTTP endpoint this used to rely on.
 */
import { readFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

const asJson = process.argv.includes("--json")

const PROFILE_DIRS = {
  darwin: [join(homedir(), "Library/Application Support/Google/Chrome")],
  linux: [join(homedir(), ".config/google-chrome"), join(homedir(), ".config/chromium")],
  win32: [join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/User Data")],
}

function browserWsUrl() {
  const candidates = process.env.CHROME_PROFILE_DIR
    ? [process.env.CHROME_PROFILE_DIR]
    : (PROFILE_DIRS[platform()] ?? [])
  for (const dir of candidates) {
    try {
      const [port, path] = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n")
      if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`
    } catch { /* try the next profile */ }
  }
  return null
}

/** Read the selectors straight from source, so this cannot drift from the extension. */
function selectorsFrom(file, constName) {
  const src = readFileSync(new URL(`../src/content-scripts/${file}`, import.meta.url), "utf8")
  const body = src
    .slice(src.indexOf(`${constName} = {`))
    // Comments here quote selector fragments, which would otherwise parse as entries
    .replace(/\/\/[^\n]*/g, "")
  const out = {}
  for (const [, key, quote, value] of body.matchAll(/(\w+):\s*(['"`])((?:[^'"`\\]|\\.)*)\2/g)) out[key] = value
  return out
}

const PLATFORMS = [
  {
    match: "meet.google.com",
    name: "Google Meet",
    selectors: selectorsFrom("google-meet/config.ts", "SELECTORS_GOOGLE_MEET"),
    // Captions expose one ligature or the other depending on state; either satisfies it
    eitherOf: [["TEXT_CAPTIONS_OFF", "TEXT_CAPTIONS_ON"]],
    // Present only in a particular state, so absence is not proof of breakage. Reported
    // rather than failed — a checker that cries wolf stops being read.
    conditional: {
      USER_NAME: "only on the pre-join screen",
      CHAT_MESSAGE: "only once the chat panel has messages",
      CHAT_GROUP_HEADER: "only once the chat panel has messages",
      CHAT_LIVE_REGION: "only once the chat panel has been opened",
    },
  },
  {
    match: "teams.", name: "Microsoft Teams",
    selectors: selectorsFrom("teams/config.ts", "SELECTORS_TEAMS"), eitherOf: [],
    conditional: { PREJOIN_JOIN_BUTTON: "only on the pre-join screen", CAPTIONS_REGION: "only once captions are on", CAPTIONS_REGION_WRAPPER: "only once captions are on" },
  },
  {
    match: "zoom.us", name: "Zoom",
    selectors: selectorsFrom("zoom/config.ts", "SELECTORS_ZOOM"), eitherOf: [],
    conditional: { TRANSCRIPT_CONTAINER: "only once captions are on", AUDIO_OPTION_MENU: "only in the meeting" },
  },
]

const wsUrl = browserWsUrl()
if (!wsUrl) {
  console.error("Could not find a running Chrome with remote debugging enabled.\n" +
    "Start Chrome with --remote-debugging-port=9222, or set CHROME_PROFILE_DIR.")
  process.exit(2)
}

const ws = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true })
  ws.addEventListener("error", () => reject(new Error(`Could not connect to ${wsUrl}`)), { once: true })
})

let nextId = 0
const send = (method, params = {}, sessionId) => new Promise(resolve => {
  const id = ++nextId
  const onMessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== id) return
    ws.removeEventListener("message", onMessage)
    resolve(msg.result)
  }
  ws.addEventListener("message", onMessage)
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
})

const { targetInfos } = await send("Target.getTargets")
const page = targetInfos.find(t => t.type === "page" && PLATFORMS.some(p => t.url.includes(p.match)))
if (!page) {
  ws.close()
  console.error("No meeting tab open. Join a meeting on Google Meet, Teams or Zoom and re-run.")
  process.exit(2)
}

const platformDef = PLATFORMS.find(p => page.url.includes(p.match))
const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true })

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId))?.result?.value

const results = []
for (const [name, value] of Object.entries(platformDef.selectors)) {
  // TEXT_* entries are Google Symbols ligatures, matched by text rather than selector
  const expression = name.startsWith("TEXT_")
    ? `[...document.querySelectorAll('.google-symbols')].filter(e => (e.textContent||'').trim() === ${JSON.stringify(value)}).length`
    : `document.querySelectorAll(${JSON.stringify(value)}).length`
  results.push({ name, value, count: (await evaluate(expression)) ?? 0 })
}
ws.close()

const satisfiedByPair = new Set()
for (const pair of platformDef.eitherOf) {
  if (pair.some(n => (results.find(r => r.name === n)?.count ?? 0) > 0)) pair.forEach(n => satisfiedByPair.add(n))
}
const conditional = platformDef.conditional ?? {}
const failures = results.filter(r => r.count === 0 && !satisfiedByPair.has(r.name) && !conditional[r.name])
const unmet = results.filter(r => r.count === 0 && conditional[r.name])

if (asJson) {
  console.log(JSON.stringify({ platform: platformDef.name, url: page.url, results, failures, untested: unmet }, null, 2))
} else {
  console.log(`\n${platformDef.name} — ${page.url}\n`)
  for (const r of results) {
    const ok = r.count > 0 || satisfiedByPair.has(r.name)
    const mark = ok ? "ok  " : (conditional[r.name] ? "n/a " : "MISS")
    const note = !ok && conditional[r.name] ? `   (${conditional[r.name]})` : ""
    console.log(`  ${mark}  ${r.name.padEnd(26)}${String(r.count).padStart(3)}   ${r.value}${note}`)
  }
  if (unmet.length) {
    console.log(`\n  ${unmet.length} selector(s) not testable in this state — re-run from the pre-join screen, and with captions and chat open, to cover them.`)
  }
  console.log(failures.length
    ? `\n${failures.length} contract(s) no longer hold. Capture will fail silently until these are updated.\n`
    : `\nAll ${results.length} contracts hold.\n`)
}

process.exit(failures.length ? 1 : 0)
