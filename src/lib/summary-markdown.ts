/**
 * Reads the small subset of markdown a ChatGPT summary actually uses — headings,
 * paragraphs, bullet and task lists, **bold** — into plain blocks the viewer can
 * render with textContent.
 *
 * It returns data rather than markup on purpose. A summary is text from a page this
 * extension does not control, so it must never reach innerHTML; anything outside the
 * subset simply stays visible as the characters it was.
 */

export interface InlineRun {
    text: string
    bold: boolean
}

export interface SummaryListItem {
    runs: InlineRun[]
    /** Set for task-list items (`- [ ]` / `- [x]`), undefined for plain bullets. */
    checked?: boolean
}

export type SummaryBlock =
    | { kind: "heading", runs: InlineRun[] }
    | { kind: "paragraph", runs: InlineRun[] }
    | { kind: "list", items: SummaryListItem[] }

/** Splits `**bold**` spans out of a line; an unmatched `**` is left as literal text. */
export function parseInline(line: string): InlineRun[] {
    const runs: InlineRun[] = []
    const pattern = /\*\*(.+?)\*\*/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
        if (match.index > last) runs.push({ text: line.slice(last, match.index), bold: false })
        runs.push({ text: match[1], bold: true })
        last = match.index + match[0].length
    }
    if (last < line.length) runs.push({ text: line.slice(last), bold: false })
    return runs
}

export function parseSummaryMarkdown(markdown: string): SummaryBlock[] {
    const blocks: SummaryBlock[] = []
    let paragraph: string[] = []
    let list: SummaryListItem[] | null = null

    function flushParagraph() {
        if (paragraph.length > 0) {
            blocks.push({ kind: "paragraph", runs: parseInline(paragraph.join(" ")) })
            paragraph = []
        }
    }

    function flushList() {
        if (list && list.length > 0) blocks.push({ kind: "list", items: list })
        list = null
    }

    for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
        const line = rawLine.trim()

        if (line === "") {
            flushParagraph()
            flushList()
            continue
        }

        const heading = /^#{1,6}\s+(.*)$/.exec(line)
        if (heading) {
            flushParagraph()
            flushList()
            blocks.push({ kind: "heading", runs: parseInline(heading[1]) })
            continue
        }

        const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
        if (item) {
            flushParagraph()
            const task = /^\[([ xX])\]\s+(.*)$/.exec(item[1])
            list = list ?? []
            list.push(task
                ? { runs: parseInline(task[2]), checked: task[1] !== " " }
                : { runs: parseInline(item[1]) })
            continue
        }

        flushList()
        paragraph.push(line)
    }

    flushParagraph()
    flushList()
    return blocks
}
