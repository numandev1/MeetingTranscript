// One-time setup for automatic Chrome Web Store submission.
//
// Signs in to Google in the browser, obtains a refresh token for the Chrome Web Store
// API, checks it can read the store item, and stores everything CI needs as GitHub
// repository secrets with `gh`. Nothing is printed or written to disk: the token goes
// straight from Google's response into `gh secret set` over stdin.
//
// Needs an OAuth client of type "Desktop app" in a Google Cloud project with the
// Chrome Web Store API enabled — see docs/chrome-web-store-publishing.md.
//
// Usage: npm run cws:auth -- [--repo owner/name] [--extension-id <id>]
// The client id and secret are asked for, or read from CWS_CLIENT_ID / CWS_CLIENT_SECRET.

import { createServer } from "node:http"
import { execFileSync, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"

const DEFAULT_REPO = "numandev1/MeetingTranscriptToObsidian"
const DEFAULT_EXTENSION_ID = "fnaehffidleegibjekglaoehffkldmhc"
const SCOPE = "https://www.googleapis.com/auth/chromewebstore"

function argument(name, fallback) {
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

async function ask(question) {
    const readline = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await readline.question(question)).trim()
    readline.close()
    return answer
}

function openInBrowser(url) {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
    spawn(command, [url], { stdio: "ignore", detached: true }).unref()
}

/** Listens on a loopback port; Google redirects the browser there with the code. */
async function startCallbackServer(state) {
    let settle
    const code = new Promise((resolve, reject) => { settle = { resolve, reject } })
    const server = createServer((request, response) => {
        const url = new URL(request.url, "http://127.0.0.1")
        if (url.pathname !== "/") {
            response.writeHead(404).end()
            return
        }
        const error = url.searchParams.get("error") ?? (url.searchParams.get("state") === state ? null : "state mismatch")
        response.writeHead(error ? 400 : 200, { "Content-Type": "text/plain" })
        response.end(error ? `Sign-in failed: ${error}` : "Chrome Web Store access granted. You can close this tab.")
        server.close()
        error ? settle.reject(new Error(`Sign-in failed: ${error}`)) : settle.resolve(url.searchParams.get("code"))
    })
    await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject))
    return { redirectUri: `http://127.0.0.1:${server.address().port}`, code }
}

function setSecret(repo, name, value) {
    execFileSync("gh", ["secret", "set", name, "--repo", repo], { input: value, stdio: ["pipe", "ignore", "inherit"] })
}

async function main() {
    const repo = argument("repo", DEFAULT_REPO)
    const extensionId = argument("extension-id", DEFAULT_EXTENSION_ID)
    const clientId = process.env.CWS_CLIENT_ID || await ask("OAuth client ID: ")
    const clientSecret = process.env.CWS_CLIENT_SECRET || await ask("OAuth client secret: ")
    if (!clientId || !clientSecret) {
        throw new Error("Both the client ID and the client secret are needed")
    }

    const state = randomUUID()
    const { redirectUri, code } = await startCallbackServer(state)
    const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPE,
        // offline + consent is what makes Google return a refresh token every time
        access_type: "offline",
        prompt: "consent",
        state,
    })
    console.log("Opening Google sign-in. Use the account that owns the Chrome Web Store item.")
    console.log(`If no browser opens, visit:\n${authUrl}\n`)
    openInBrowser(authUrl)

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
            code: await code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || !tokens.refresh_token) {
        throw new Error(`Token exchange failed: ${tokens.error ?? tokenResponse.status} ${tokens.error_description ?? ""}`)
    }

    // Prove the credentials reach this item before CI relies on them
    const item = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}?projection=DRAFT`, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, "x-goog-api-version": "2" },
    })
    const itemBody = await item.json()
    if (!item.ok || itemBody.id !== extensionId) {
        throw new Error(`Signed in, but item ${extensionId} is not accessible with this account: ${JSON.stringify(itemBody.error ?? itemBody)}`)
    }
    console.log(`Verified access to item ${extensionId}`)

    setSecret(repo, "CWS_CLIENT_ID", clientId)
    setSecret(repo, "CWS_CLIENT_SECRET", clientSecret)
    setSecret(repo, "CWS_REFRESH_TOKEN", tokens.refresh_token)
    execFileSync("gh", ["variable", "set", "CWS_EXTENSION_ID", "--repo", repo, "--body", extensionId], { stdio: ["ignore", "ignore", "inherit"] })
    console.log(`Stored CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN and CWS_EXTENSION_ID on ${repo}.`)
    console.log("Every new version merged to main will now be submitted to the Chrome Web Store.")
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
