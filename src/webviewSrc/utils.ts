export function getElementByIdOrThrow(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (el === null) {
        throw new Error(`${id} not found in the document`);
    }
    return el;
}

export function scrollToRow(row: HTMLElement) {
    row.scrollIntoView({ block: "nearest", inline: "center" });
}
