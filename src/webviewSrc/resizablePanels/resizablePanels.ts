export function initResizablePanels(): void {
    const resizableDividers = document.getElementsByClassName("verticalResizableDivider");
    for (let i = 0; i < resizableDividers.length; i++) {
        const it = resizableDividers[i];
        void initResizablePanel(it as HTMLElement);
    }
}

async function initResizablePanel(divider: HTMLElement): Promise<void> {
    // ====================
    // Get all the required elements
    // ====================
    // A divider should have one previous and one next sibling
    const prevSibling = divider.previousElementSibling as HTMLElement;
    const nextSibling = divider.nextElementSibling as HTMLElement;
    if (!prevSibling || !nextSibling) {
        console.error("[SARIF Explorer] No previous or next sibling found for resizable divider.");
        return;
    }

    const parent = divider.parentNode as HTMLElement;
    if (parent === null) {
        throw new Error("No parent found for resizable divider.");
    }

    // ====================
    // Set the initial height of the panel to 70% of the parent's height
    // ====================
    // The next panel should take up the remaining space
    nextSibling.style.flex = "1";

    // Wait until the parent's height is not 0 (i.e., it is rendered) and then set the panel's height
    let parentHeight = 0;
    while (parentHeight === 0) {
        parentHeight = parent.getBoundingClientRect().height;
        await new Promise((resolve): void => {
            setTimeout(resolve, 10);
        });
    }
    // Set the panel's height to 70% of the parent's height in pixels (has to be in pixels for the overflow-y to work)
    const h = (parentHeight * 70) / 100;
    prevSibling.style.height = `${h}px`;

    // ====================
    // Handle the dragging events
    // ====================
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let x = 0;
    let y = 0;
    let prevSiblingHeight = 0;

    // Handle the mousedown event that's triggered when user drags the divider
    const mouseDownHandler = function (e: MouseEvent): void {
        // Get the current mouse position
        x = e.clientX;
        y = e.clientY;
        prevSiblingHeight = prevSibling.getBoundingClientRect().height;

        // Attach the listeners to `document`
        document.addEventListener("mousemove", mouseMoveHandler);
        document.addEventListener("mouseup", mouseUpHandler);
    };

    const mouseMoveHandler = function (e: MouseEvent): void {
        // How far the mouse has been moved
        const dy = e.clientY - y;

        const parentHeight = parent.getBoundingClientRect().height;
        const h = ((prevSiblingHeight + dy) * 100) / parentHeight;
        prevSibling.style.height = `${h}%`;

        divider.style.cursor = "row-resize";
        document.body.style.cursor = "row-resize";

        // Prevent text selection
        prevSibling.style.userSelect = "none";
        prevSibling.style.pointerEvents = "none";
        nextSibling.style.userSelect = "none";
        nextSibling.style.pointerEvents = "none";
    };

    const mouseUpHandler = function (): void {
        divider.style.removeProperty("cursor");
        document.body.style.removeProperty("cursor");

        prevSibling.style.removeProperty("user-select");
        prevSibling.style.removeProperty("pointer-events");
        nextSibling.style.removeProperty("user-select");
        nextSibling.style.removeProperty("pointer-events");

        // Remove the handlers of `mousemove` and `mouseup`
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
    };

    // Attach the handler
    divider.addEventListener("mousedown", mouseDownHandler);
}
