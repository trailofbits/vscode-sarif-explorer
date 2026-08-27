// Tests for the webview DOM helpers in src/webviewSrc/utils.ts.
// The helpers are exercised against a standalone jsdom document, so no webview HTML is needed.

import * as assert from "assert";

import { JSDOM } from "jsdom";

import { setEllipsisBeginningText } from "../../webviewSrc/utils";

function createCell(): HTMLElement {
    const dom = new JSDOM("<!doctype html><body></body>");
    return dom.window.document.createElement("td");
}

suite("Webview Utils Test Suite", () => {
    test("setEllipsisBeginningText keeps the text of a dotfile path intact", () => {
        const cell = createCell();

        setEllipsisBeginningText(cell, ".env.test:12");

        assert.strictEqual(cell.textContent, ".env.test:12");
    });

    test("setEllipsisBeginningText isolates the text as left-to-right", () => {
        const cell = createCell();

        setEllipsisBeginningText(cell, ".env.test:12");

        assert.strictEqual(cell.children.length, 1);
        const wrapper = cell.children[0] as HTMLElement;
        assert.strictEqual(wrapper.dir, "ltr");
        assert.strictEqual(wrapper.textContent, ".env.test:12");
    });

    test("setEllipsisBeginningText replaces the previous text instead of appending to it", () => {
        const cell = createCell();

        setEllipsisBeginningText(cell, ".env.test:12");
        setEllipsisBeginningText(cell, ".gitignore:3");

        assert.strictEqual(cell.children.length, 1);
        assert.strictEqual(cell.textContent, ".gitignore:3");
    });
});
