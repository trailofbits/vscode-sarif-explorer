import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../../extension';

type VSCodeApi = {
    postMessage: (msg: unknown) => void;
};

type GlobalWithAcquireVsCodeApi = typeof globalThis & {
    acquireVsCodeApi?: () => VSCodeApi;
};

async function loadSarifFileClass(): Promise<typeof import("../../webviewSrc/sarifFile/sarifFile").SarifFile> {
    const globalWithAcquireVsCodeApi = globalThis as GlobalWithAcquireVsCodeApi;
    if (globalWithAcquireVsCodeApi.acquireVsCodeApi === undefined) {
        globalWithAcquireVsCodeApi.acquireVsCodeApi = (): VSCodeApi => {
            return {
                postMessage: (): void => {},
            };
        };
    }

    const sarifFileModule = await import("../../webviewSrc/sarifFile/sarifFile");
    return sarifFileModule.SarifFile;
}

suite("Extension Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.");

    test("Sample test", () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });

    test("Parses results without ruleId and keeps synthetic rules isolated", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: {
                        driver: {
                            name: "sample-runner",
                            version: "1.2.3",
                        },
                        extensions: [
                            {
                                name: "sample-extension-runner",
                                version: "0.2.0",
                                properties: {
                                    role: "integration",
                                    parameters: {
                                        model: "generic-model",
                                        temperature: 0,
                                    },
                                },
                            },
                            {
                                driver: {
                                    name: "generic-auditor",
                                    version: "0.3.1",
                                },
                                properties: {
                                    role: "module",
                                },
                            },
                        ],
                    },
                    automationDetails: {
                        id: "run-2026-02-09",
                    },
                    versionControlProvenance: [
                        {
                            repositoryUri: "https://example.com/org/sample-repo",
                            revisionId: "redacted-revision-id",
                        },
                    ],
                    results: [
                        {
                            message: { text: "Unchecked external call" },
                            properties: {
                                apolloResultId: "shared-result-id",
                                author: "analyst",
                                description: "Detailed finding description.",
                            },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "contracts/Vault.sol" },
                                        region: { startLine: 120, endLine: 140 },
                                    },
                                },
                            ],
                        },
                        {
                            message: { text: "Unchecked external call" },
                            properties: {
                                apolloResultId: "shared-result-id",
                                author: "analyst",
                                description: "Another finding description.",
                            },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "contracts/Vault.sol" },
                                        region: { startLine: 220, endLine: 240 },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/ruleless.sarif", JSON.stringify(sarifJson), {}, [], "");
        const results = sarifFile.getAllResults();
        assert.strictEqual(results.length, 2);

        const firstResult = results[0];
        const secondResult = results[1];
        assert.notStrictEqual(firstResult.getRuleId(), secondResult.getRuleId());
        assert.ok(firstResult.getRuleId().includes("__no_rule__:"));

        assert.strictEqual(firstResult.getRule().name, "Unchecked external call");
        assert.strictEqual(firstResult.getAuthor(), "analyst");
        assert.strictEqual(firstResult.getDescription(), "Detailed finding description.");

        const runTool = sarifFile.getRunTool(0);
        assert.strictEqual(runTool.name, "sample-runner");
        assert.strictEqual(runTool.version, "1.2.3");
        assert.strictEqual(runTool.extensions.length, 2);
        assert.strictEqual(runTool.extensions[0].name, "sample-extension-runner");
        assert.deepStrictEqual(runTool.extensions[0].properties, {
            role: "integration",
            parameters: {
                model: "generic-model",
                temperature: 0,
            },
        });
        assert.strictEqual(runTool.extensions[1].name, "generic-auditor");
        assert.strictEqual(runTool.extensions[1].version, "0.3.1");
        assert.deepStrictEqual(runTool.extensions[1].properties, {
            role: "module",
        });

        assert.strictEqual(sarifFile.getRunAutomationDetailsId(0), "run-2026-02-09");
        assert.deepStrictEqual(sarifFile.getRunVersionControlProvenance(0), [
            {
                repositoryUri: "https://example.com/org/sample-repo",
                revisionId: "redacted-revision-id",
            },
        ]);
    });

    test("Handles missing result message for rule-less result", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: {
                        driver: {
                            name: "weaudit-import",
                        },
                    },
                    results: [
                        {
                            properties: {
                                author: "importer",
                                description: "Imported finding.",
                            },
                            locations: [],
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/ruleless-empty-message.sarif", JSON.stringify(sarifJson), {}, [], "");
        const result = sarifFile.getAllResults()[0];

        assert.strictEqual(result.getMessage(), "");
        assert.strictEqual(result.getRule().name, "Unnamed result");
        assert.strictEqual(result.getAuthor(), "importer");
        assert.strictEqual(result.getDescription(), "Imported finding.");
    });
});
