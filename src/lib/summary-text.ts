/**
 * Final line the model is asked to emit. Its presence is a definitive end-of-answer
 * signal, which the DOM alone does not give: the stop button can vanish while text is
 * still streaming, and a partly streamed answer looks identical to a finished one.
 */
export const END_MARKER = "<!--meetingtranscript-end-->"

/**
 * Chooses the answer text from the two readings taken out of the ChatGPT message.
 *
 * The fenced block is preferred because its text keeps the markdown syntax, where the
 * rendered message would give "Summary" instead of "## Summary".
 *
 * It is preferred **only when it actually holds text**, which is the whole point of
 * this function. ChatGPT renders the opening fence as soon as the model emits it, so
 * for the first seconds of every answer — and for any run where the text ends up
 * outside the block — `pre code` exists and is empty. Reading it with `??` treated
 * that empty string as the answer and never looked at the message, so a summary that
 * was plainly on screen was read as nothing at all until the request timed out.
 */
export function pickAnswerText(codeBlockText: string | undefined, messageText: string | undefined): string {
    const fromCode = (codeBlockText ?? "").trim()
    if (fromCode) {
        return fromCode
    }
    return (messageText ?? "").trim()
}

/** True once the model has emitted its agreed final line. */
export function isAnswerComplete(text: string): boolean {
    return text.includes(END_MARKER)
}

/** Removes the end marker, wherever the renderer put it. */
export function stripEndMarker(text: string): string {
    return text.split(END_MARKER).join("").trim()
}

/**
 * Whether an answer with no end marker can be treated as finished.
 *
 * This is the fallback path, and it is the one that filed a half-written summary as a
 * success, so every condition here is load-bearing:
 *
 * - `text` must be non-empty. The stop button disappears a beat before the text reaches
 *   the DOM, so an empty reading is the most common false positive.
 * - the text must not have changed since the previous poll, and
 * - ChatGPT must not be generating, and
 * - it must have been *seen* generating earlier in this run. Without that, a pause before
 *   the answer starts is indistinguishable from an answer that finished, and the first
 *   burst of text gets stored as the whole summary.
 *
 * The caller additionally requires this to hold for several consecutive polls.
 */
export function isStableAnswer(reading: {
    text: string
    previousText: string
    busy: boolean
    sawGenerating: boolean
}): boolean {
    return Boolean(reading.text)
        && (reading.text === reading.previousText)
        && !reading.busy
        && reading.sawGenerating
}
