// Tests for resolveWorkspacePath in src/extension/operations/openSarifFile.ts, which resolves the
// paths given to the sarif-explorer.openSarifFile command.

import * as assert from "assert";
import * as path from "path";

import { resolveWorkspacePath } from "../../extension/operations/openSarifFile";

// src/test, which holds sarif_files/; the tests run from out/test/suite
const testFolder = path.resolve(__dirname, "../../../src/test");
const missingFolder = path.resolve(__dirname, "missing-workspace-folder");

suite("Open SARIF File Test Suite", () => {
    test("resolveWorkspacePath keeps an absolute path", () => {
        const absolutePath = path.join(testFolder, "sarif_files", "fake.sarif");

        assert.strictEqual(resolveWorkspacePath(absolutePath, [missingFolder]), absolutePath);
    });

    test("resolveWorkspacePath keeps a relative path when there is no workspace folder", () => {
        assert.strictEqual(resolveWorkspacePath("sarif_files/fake.sarif", []), "sarif_files/fake.sarif");
    });

    test("resolveWorkspacePath resolves against the workspace folder that contains the file", () => {
        assert.strictEqual(resolveWorkspacePath("sarif_files/fake.sarif", [missingFolder, testFolder]), path.join(testFolder, "sarif_files", "fake.sarif"));
    });

    test("resolveWorkspacePath falls back to the first workspace folder", () => {
        assert.strictEqual(
            resolveWorkspacePath("sarif_files/not-generated-yet.sarif", [missingFolder, testFolder]),
            path.join(missingFolder, "sarif_files", "not-generated-yet.sarif"),
        );
    });
});
