// Decides whether a push to main ships a new version, and if so bumps it.
//
// The next version is the patch after the highest v* tag, unless package.json was
// already bumped past it by hand (say to 0.2.0 for a bigger change), in which case
// that version is used as is. Nothing ships when no file that goes into the
// extension changed since the last tag, so a docs- or CI-only push does not cut a
// release; `--force` ships anyway (Run workflow → release).
//
// On a release it writes the version into package.json, package-lock.json and
// src/manifest.json, adds a CHANGELOG.md section built from the commit subjects
// since the last tag (unless one was written by hand), and writes the notes to
// release-notes.md. CI commits those files, tags and publishes.
//
// Usage: node scripts/prepare-release.mjs [--force] [--dry-run]
// Prints and, under GitHub Actions, outputs: release, version, previous.

import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"

// Only tags in this history count, so tags fetched from another remote (the
// upstream project numbers its releases 3.x) cannot hijack the version.
/** What ends up in the built extension. A change anywhere else is not a release. */
const SHIPPED_PATHS = ["src", "package-lock.json", "webpack.config.js", "utils", "tsconfig.json"]
const RELEASE_COMMIT_PREFIX = "chore(release):"

const force = process.argv.includes("--force")
const dryRun = process.argv.includes("--dry-run")

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function parse(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    if (!match) {
        throw new Error(`Not a plain x.y.z version: ${version}`)
    }
    return match.slice(1).map(Number)
}

function compare(a, b) {
    const [x, y] = [parse(a), parse(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

function output(values) {
    for (const [key, value] of Object.entries(values)) {
        console.log(`${key}=${value}`)
        if (process.env.GITHUB_OUTPUT) {
            appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
        }
    }
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"))
}

/**
 * Rewrites only the version string(s), leaving the rest of the file byte for byte —
 * re-serialising would reflow the hand-formatted manifest. The top-level version
 * comes first in all three files; a lockfile repeats it in packages[""] next.
 */
function setVersion(path, version, { occurrences = 1 } = {}) {
    let remaining = occurrences
    const text = readFileSync(path, "utf8").replace(/("version"\s*:\s*")[^"]*(")/g, (match, open, close) =>
        remaining-- > 0 ? `${open}${version}${close}` : match)
    if (remaining > 0) {
        throw new Error(`No version field to update in ${path}`)
    }
    writeFileSync(path, text)
}

function changelogSection(changelog, version) {
    const lines = changelog.split("\n")
    const start = lines.indexOf(`## ${version}`)
    if (start < 0) {
        return ""
    }
    const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
    return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim()
}

function main() {
    // Only tags in this history count, so tags fetched from another remote (the
    // upstream project numbers its releases 3.x) cannot hijack the version.
    const tags = git("tag", "--merged", "HEAD", "--list", "v*").split("\n")
        .map(tag => tag.slice(1))
        .filter(version => /^\d+\.\d+\.\d+$/.test(version))
        .sort(compare)
    const previous = tags[tags.length - 1]
    const current = readJson("package.json").version

    if (previous && !force) {
        const changed = git("diff", "--name-only", `refs/tags/v${previous}`, "HEAD", "--", ...SHIPPED_PATHS)
        if (!changed) {
            console.log(`Nothing that ships changed since v${previous}; no release`)
            output({ release: false, version: current, previous: previous ?? "" })
            return
        }
    }

    let version = current
    if (previous && compare(current, previous) <= 0) {
        const [major, minor, patch] = parse(previous)
        version = `${major}.${minor}.${patch + 1}`
    }

    const range = previous ? [`refs/tags/v${previous}..HEAD`] : ["HEAD"]
    const subjects = git("log", ...range, "--no-merges", "--format=%s").split("\n")
        .filter(subject => subject && !subject.startsWith(RELEASE_COMMIT_PREFIX))
        .slice(0, 50)

    const changelog = readFileSync("CHANGELOG.md", "utf8")
    let notes = changelogSection(changelog, version)
    if (!notes) {
        notes = subjects.length > 0 ? subjects.map(subject => `- ${subject}`).join("\n") : "- Maintenance release."
        if (!dryRun) {
            const heading = changelog.match(/^# .*\n+/)?.[0] ?? "# Changelog\n\n"
            writeFileSync("CHANGELOG.md", `${heading}## ${version}\n\n${notes}\n\n${changelog.slice(heading.length)}`)
        }
    }

    if (!dryRun) {
        setVersion("package.json", version)
        setVersion("package-lock.json", version, { occurrences: 2 })
        setVersion("src/manifest.json", version)
        writeFileSync("release-notes.md", notes + "\n")
    }
    console.log(notes)
    output({ release: true, version, previous: previous ?? "" })
}

main()
