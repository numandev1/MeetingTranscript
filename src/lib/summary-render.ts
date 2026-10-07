import { parseSummaryMarkdown, type InlineRun } from "./summary-markdown"

/*
 * DOM half of the summary renderer, shared by the meetings page and the side panel so a
 * summary looks the same wherever it is read. Everything goes in through textContent and
 * text nodes; the summary comes from a page this extension does not control.
 */

/** Appends inline runs as text nodes, with bold spans as <strong>. Never markup. */
function appendRuns(parent: HTMLElement, runs: InlineRun[]): void {
    runs.forEach(run => {
        if (run.bold) {
            const strong = document.createElement("strong")
            strong.textContent = run.text
            parent.appendChild(strong)
        }
        else {
            parent.appendChild(document.createTextNode(run.text))
        }
    })
}

/** Renders a summary's markdown structure, so the viewer shows headings and lists rather than `##` and `-`. */
export function buildSummaryDocument(summary: string): HTMLElement {
    const doc = document.createElement("div")
    doc.className = "summary-doc"

    const blocks = parseSummaryMarkdown(summary)
    // The section is already labelled Summary; a leading "## Summary" would say it twice
    const first = blocks[0]
    if (first?.kind === "heading" && first.runs.map(run => run.text).join("").trim().toLowerCase() === "summary") {
        blocks.shift()
    }

    blocks.forEach(block => {
        if (block.kind === "list") {
            const list = document.createElement("ul")
            block.items.forEach(item => {
                const li = document.createElement("li")
                if (item.checked !== undefined) {
                    const box = document.createElement("input")
                    box.type = "checkbox"
                    box.checked = item.checked
                    box.disabled = true
                    li.appendChild(box)
                    li.style.listStyle = "none"
                }
                appendRuns(li, item.runs)
                list.appendChild(li)
            })
            doc.appendChild(list)
            return
        }
        const element = document.createElement(block.kind === "heading" ? "h4" : "p")
        appendRuns(element, block.runs)
        doc.appendChild(element)
    })

    return doc
}
