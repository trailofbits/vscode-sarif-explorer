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

// Sets the text of an element styled with `.ellipsis-beginning`. That class uses
// `direction: rtl` to place the ellipsis at the start of the text, which makes the bidi
// algorithm move punctuation at the edges of the string (e.g. the leading dot of
// `.env.test`). Wrapping the text in a left-to-right isolated element keeps its order.
export function setEllipsisBeginningText(element: HTMLElement, text: string): void {
    const span = element.ownerDocument.createElement("span");
    span.dir = "ltr";
    span.textContent = text;
    element.replaceChildren(span);
}
