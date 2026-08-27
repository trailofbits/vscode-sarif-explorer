export function getElementByIdOrThrow(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (el === null) {
        throw new Error(`${id} not found in the document`);
    }
    return el;
}

export function scrollToRow(row: HTMLElement): void {
    row.scrollIntoView({ block: "nearest", inline: "center" });
}

// Removes the whitespace prefix shared by all non-blank lines of a code snippet, as well as its trailing blank lines.
// SARIF snippets include the indentation the code has in the original file, which wastes horizontal space when rendered.
export function dedentSnippet(snippet: string): string {
    const lines = snippet.split("\n");

    // Drop the trailing blank lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }

    // Find the longest whitespace prefix shared by every non-blank line. Prefixes are compared literally so that we
    // never guess a tab width for snippets that mix tabs and spaces.
    let commonIndentation: string | undefined = undefined;
    for (const line of lines) {
        if (line.trim() === "") {
            continue;
        }

        const indentation = line.match(/^[ \t]*/)![0];
        if (commonIndentation === undefined) {
            commonIndentation = indentation;
            continue;
        }

        let i = 0;
        while (i < commonIndentation.length && i < indentation.length && commonIndentation[i] === indentation[i]) {
            i++;
        }
        commonIndentation = commonIndentation.substring(0, i);
    }

    if (commonIndentation === undefined || commonIndentation === "") {
        return lines.join("\n");
    }

    const indentationToRemove = commonIndentation;
    return lines.map((line): string => (line.trim() === "" ? "" : line.substring(indentationToRemove.length))).join("\n");
}
