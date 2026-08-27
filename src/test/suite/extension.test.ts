import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { dedentSnippet } from "../../webviewSrc/utils";
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

    test("Uses result description first, then rule fullDescription, then rule shortDescription", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: {
                        driver: {
                            name: "description-precedence-tool",
                            rules: [
                                {
                                    id: "rule.full.short",
                                    shortDescription: { text: "Short rule description" },
                                    fullDescription: { text: "Full rule description" },
                                },
                                {
                                    id: "rule.short.only",
                                    shortDescription: { text: "Only short rule description" },
                                },
                                {
                                    id: "rule.none",
                                },
                            ],
                        },
                    },
                    results: [
                        {
                            ruleId: "rule.full.short",
                            message: { text: "Result with explicit description" },
                            properties: {
                                description: "Result-level description",
                            },
                        },
                        {
                            ruleId: "rule.full.short",
                            message: { text: "Result without explicit description" },
                        },
                        {
                            ruleId: "rule.short.only",
                            message: { text: "Result with short-only rule description" },
                        },
                        {
                            ruleId: "rule.none",
                            message: { text: "Result without any description metadata" },
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/description-precedence.sarif", JSON.stringify(sarifJson), {}, [], "");
        const results = sarifFile.getAllResults();

        assert.strictEqual(results.length, 4);
        assert.strictEqual(results[0].getDescription(), "Result-level description");
        assert.strictEqual(results[1].getDescription(), "Full rule description");
        assert.strictEqual(results[2].getDescription(), "Only short rule description");
        assert.strictEqual(results[3].getDescription(), "");
    });

    test("Parses region snippets for all of a result's locations", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const multiLineSnippet = "\t\tTLSClientConfig: &tls.Config{\n\t\t\tInsecureSkipVerify: true,\n\t\t},";
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "snippet-tool" } },
                    results: [
                        {
                            ruleId: "snippet.rule",
                            message: { text: "Result with snippets in every location" },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/http.go" },
                                        region: { startLine: 38, endLine: 40, snippet: { text: multiLineSnippet } },
                                    },
                                },
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/other.go" },
                                        region: { startLine: 12, snippet: { text: "const x = 1;" } },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/snippets.sarif", JSON.stringify(sarifJson), {}, [], "");
        const locations = sarifFile.getAllResults()[0].getLocations();

        assert.strictEqual(locations.length, 2);
        // The snippet is stored verbatim; it is only dedented when it is rendered
        assert.strictEqual(locations[0].snippet, multiLineSnippet);
        assert.strictEqual(locations[1].snippet, "const x = 1;");
    });

    test("Leaves the snippet undefined when the SARIF file provides no snippet text", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "snippet-less-tool" } },
                    results: [
                        {
                            ruleId: "snippet.rule",
                            message: { text: "Result without usable snippets" },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/no_snippet.go" },
                                        region: { startLine: 1 },
                                    },
                                },
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/empty_snippet_object.go" },
                                        region: { startLine: 2, snippet: {} },
                                    },
                                },
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/empty_snippet_text.go" },
                                        region: { startLine: 3, snippet: { text: "" } },
                                    },
                                },
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/non_string_snippet_text.go" },
                                        region: { startLine: 4, snippet: { text: { unexpected: true } } },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/no-snippets.sarif", JSON.stringify(sarifJson), {}, [], "");
        const locations = sarifFile.getAllResults()[0].getLocations();

        assert.strictEqual(locations.length, 4);
        for (const location of locations) {
            assert.strictEqual(location.snippet, undefined, `Unexpected snippet for ${location.path}`);
        }
    });

    test("Parses snippets on related locations and data flow steps", async () => {
        const sarifFileClass = await loadSarifFileClass();
        const sarifJson = {
            version: "2.1.0",
            runs: [
                {
                    tool: { driver: { name: "snippet-flow-tool" } },
                    results: [
                        {
                            ruleId: "snippet.flow.rule",
                            message: { text: "Result with a data flow" },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/sink.go" },
                                        region: { startLine: 30, snippet: { text: "sink(taint);" } },
                                    },
                                },
                            ],
                            relatedLocations: [
                                {
                                    id: 1,
                                    message: { text: "related" },
                                    physicalLocation: {
                                        artifactLocation: { uri: "src/related.go" },
                                        region: { startLine: 7, snippet: { text: "related(code);" } },
                                    },
                                },
                            ],
                            codeFlows: [
                                {
                                    threadFlows: [
                                        {
                                            locations: [
                                                {
                                                    location: {
                                                        message: { text: "source" },
                                                        physicalLocation: {
                                                            artifactLocation: { uri: "src/source.go" },
                                                            region: { startLine: 10, snippet: { text: "taint = source();" } },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const sarifFile = new sarifFileClass("/tmp/snippet-flow.sarif", JSON.stringify(sarifJson), {}, [], "");
        const result = sarifFile.getAllResults()[0];

        assert.strictEqual(result.getRelatedLocations().get(1)?.location.snippet, "related(code);");
        assert.strictEqual(result.getDataFlow()[0].location.snippet, "taint = source();");
    });

    test("dedentSnippet removes the indentation shared by all non-blank lines", () => {
        // Space indentation
        assert.strictEqual(dedentSnippet("    if (a) {\n        b();\n    }"), "if (a) {\n    b();\n}");

        // Tab indentation, as emitted by Semgrep for Go files
        assert.strictEqual(
            dedentSnippet("\t\tTLSClientConfig: &tls.Config{\n\t\t\tInsecureSkipVerify: true,\n\t\t},"),
            "TLSClientConfig: &tls.Config{\n\tInsecureSkipVerify: true,\n},",
        );

        // A blank line in the middle does not prevent dedenting
        assert.strictEqual(dedentSnippet("    a();\n\n    b();"), "a();\n\nb();");

        // Nothing to strip
        assert.strictEqual(dedentSnippet("a();"), "a();");
        assert.strictEqual(dedentSnippet("a();\n    b();"), "a();\n    b();");

        // Mixed tabs and spaces are compared literally, so only the common prefix is stripped
        assert.strictEqual(dedentSnippet("\t a();\n\t\tb();"), " a();\n\tb();");

        // Trailing blank lines are dropped
        assert.strictEqual(dedentSnippet("    a();\n"), "a();");
        assert.strictEqual(dedentSnippet("    a();\n    \n\n"), "a();");

        // Snippets with no code at all
        assert.strictEqual(dedentSnippet(""), "");
        assert.strictEqual(dedentSnippet("   \n  \n"), "");
    });
});
