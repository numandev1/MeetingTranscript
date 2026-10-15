// Uploads a built zip to the Chrome Web Store and submits it for review.
//
// Run by CI after a versioned release is cut. Credentials come from the
// environment, never from arguments, so they cannot end up in a process list or a
// log: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN and CWS_EXTENSION_ID.
// `npm run cws:auth` creates them once and stores them as repository secrets.
//
// Usage: node scripts/cws-publish.mjs <path-to-zip>
// Exit codes: 0 submitted, 1 failed, 2 not configured (CI warns and moves on).

import { readFile } from "node:fs/promises"

const API = "https://www.googleapis.com/chromewebstore/v1.1/items"
const UPLOAD_API = "https://www.googleapis.com/upload/chromewebstore/v1.1/items"
const NOT_CONFIGURED = 2

function fail(message) {
    console.error(`::error::${message}`)
    process.exit(1)
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    })
    const body = await response.json()
    if (!response.ok || !body.access_token) {
        // invalid_grant almost always means the refresh token expired, which happens
        // after 7 days while the OAuth consent screen is left in "Testing"
        fail(`Could not get a Chrome Web Store access token (${body.error ?? response.status}: ${body.error_description ?? ""}). `
            + "Re-run `npm run cws:auth`, and make sure the OAuth consent screen is published to production.")
    }
    console.log(`::add-mask::${body.access_token}`)
    return body.access_token
}

async function main() {
    const zipPath = process.argv[2]
    if (!zipPath) {
        fail("Usage: node scripts/cws-publish.mjs <path-to-zip>")
    }

    const env = {
        CWS_CLIENT_ID: process.env.CWS_CLIENT_ID,
        CWS_CLIENT_SECRET: process.env.CWS_CLIENT_SECRET,
        CWS_REFRESH_TOKEN: process.env.CWS_REFRESH_TOKEN,
        CWS_EXTENSION_ID: process.env.CWS_EXTENSION_ID,
    }
    const missing = Object.entries(env).filter(([, value]) => !value).map(([name]) => name)
    if (missing.length > 0) {
        console.log(`::warning::Not submitted to the Chrome Web Store: ${missing.join(", ")} not set. Run \`npm run cws:auth\` once to configure it.`)
        process.exit(NOT_CONFIGURED)
    }

    const token = await getAccessToken({
        clientId: env.CWS_CLIENT_ID,
        clientSecret: env.CWS_CLIENT_SECRET,
        refreshToken: env.CWS_REFRESH_TOKEN,
    })
    const headers = { Authorization: `Bearer ${token}`, "x-goog-api-version": "2" }
    const extensionId = env.CWS_EXTENSION_ID

    console.log(`Uploading ${zipPath} to item ${extensionId}`)
    const upload = await fetch(`${UPLOAD_API}/${extensionId}`, {
        method: "PUT",
        headers,
        body: await readFile(zipPath),
    })
    const uploadBody = await upload.json()
    console.log(JSON.stringify(uploadBody))
    if (uploadBody.uploadState !== "SUCCESS") {
        // ITEM_NOT_UPDATABLE: a previous version is still in review. The store takes
        // one submission at a time; re-run the workflow once that review clears.
        const detail = (uploadBody.itemError ?? []).map(error => `${error.error_code}: ${error.error_detail}`).join("; ")
        fail(`Chrome Web Store upload failed (${uploadBody.uploadState ?? upload.status}). ${detail || JSON.stringify(uploadBody)}`)
    }

    const publish = await fetch(`${API}/${extensionId}/publish`, {
        method: "POST",
        headers: { ...headers, "Content-Length": "0" },
    })
    const publishBody = await publish.json()
    console.log(JSON.stringify(publishBody))
    const status = publishBody.status ?? []
    if (!status.includes("OK") && !status.includes("ITEM_PENDING_REVIEW")) {
        fail(`Chrome Web Store submission failed: ${status.join(", ")} ${(publishBody.statusDetail ?? []).join(" ")}`)
    }
    console.log("Submitted to the Chrome Web Store for review")
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
