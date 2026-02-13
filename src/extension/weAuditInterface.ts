import * as vscode from "vscode";
import { ExportedResult } from "../shared/resultTypes";
import { Entry, EntryType, FindingDifficulty, FindingSeverity, FindingType, Location } from "./weAuditTypes";

const weAuditExtensionId = "trailofbits.weaudit";

export class WeAuditNotInstalledError extends Error {
    constructor() {
        super("Please install the `weAudit` VSCode extension to use this feature");
        this.name = "WeAuditNotInstalledError";
    }

    public showInstallWeAuditVSCodeError(errorMsg: string) {
        vscode.window.showErrorMessage(`${errorMsg}: ${this.message}.`, "Install weAudit").then((selection) => {
            if (selection === "Install weAudit") {
                vscode.commands.executeCommand("workbench.extensions.action.showExtensionsWithIds", [weAuditExtensionId]);
            }
        });
    }
}

export function isWeAuditInstalled(): boolean {
    return vscode.extensions.getExtension(weAuditExtensionId) !== undefined;
}

export async function getGitHubPermalink(startLine: number, endLine: number, absolutePath: string): Promise<string> {
    // Ensure that the weAudit extension is installed
    if (!isWeAuditInstalled()) {
        throw new WeAuditNotInstalledError();
    }

    // Call the `weAudit.getClientPermalink` command of the weAudit extension
    // "weAudit.getClientPermalink", (location: Location): string
    const location: Location = {
        path: absolutePath,
        startLine: startLine,
        endLine: endLine,
        label: "",
        description: "",
    };
    const permalink = await vscode.commands.executeCommand<string>("weAudit.getClientPermalink", location);
    return permalink;
}

async function exportedResultsToEntry(results: ExportedResult[]): Promise<Entry> {
    // Ensure that every bug has the same ruleName
    if (!results.every((result) => result.rule.name === results[0].rule.name)) {
        throw new Error(
            "Failed to convert an ExportedResult list into a single weAudit Entry. Expected all items inside ExportedResult[] to be from the same rule.",
        );
    }

    const rule = results[0].rule;

    const locations = [];
    for (const result of results) {
        const primaryLocation = result.locations[0];
        const resultsHasDataflow = result.dataFlow.length > 0;

        // Add the result message and comment as location description
        let locationDescription = "";
        locationDescription += result.message.trim();
        if (result.note.comment !== "") {
            locationDescription += "\n\n";
            locationDescription += result.note.comment.trim();
        }

        // If we have dataFlow data, add it to the description of the location
        if (resultsHasDataflow) {
            locationDescription += "\n\n";
            locationDescription += "Data Flow:\n";
            for (let i = 0; i < result.dataFlow.length; i++) {
                const dataFlowElement = result.dataFlow[i];
                const dataFlowLocation = dataFlowElement.location;

                let label;
                if (i === 0) {
                    label = "Source";
                } else if (i === result.dataFlow.length - 1) {
                    label = "Sink";
                } else {
                    label = i.toString();
                }
                locationDescription += " - " + label + ": ";
                locationDescription += await getGitHubPermalink(
                    dataFlowLocation.region.startLine - 1,
                    dataFlowLocation.region.endLine - 1,
                    dataFlowLocation.path,
                );
                locationDescription += " (" + dataFlowElement.message.trim() + ")\n";
            }
        }

        // Add the primary location to the description. Add the primary location to the locations array
        // NOTE: We purposely do not add the dataflow locations to the locations array because
        // weAudit does not work well with overlapping locations which is often the case
        locations.push({
            path: primaryLocation.path,
            startLine: primaryLocation.region.startLine - 1,
            endLine: primaryLocation.region.endLine - 1,
            label: "",
            description: locationDescription.trim(),
        });
    }

    // Setup the recommendations
    let recommendations = rule.help;
    if (recommendations === "") {
        recommendations = rule.helpURI;
    } else if (rule.helpURI !== "") {
        recommendations += " (";
        recommendations += rule.helpURI;
        recommendations += ")";
    }

    const entry: Entry = {
        label: rule.name,
        entryType: EntryType.Finding,
        author: rule.toolName,
        locations: locations,
        details: {
            severity: FindingSeverity.Undefined,
            difficulty: FindingDifficulty.Undefined,
            type: FindingType.Undefined,
            description: rule.fullDescription.trim(),
            exploit: "",
            recommendation: recommendations.trim(),
        },
    };

    return entry;
}

export async function openGithubIssueFromResults(results: ExportedResult[]) {
    // Ensure that the weAudit extension is installed
    if (!isWeAuditInstalled()) {
        throw new WeAuditNotInstalledError();
    }

    const entry = await exportedResultsToEntry(results);

    // "weAudit.openGithubIssue", (node: Entry) => {
    await vscode.commands.executeCommand("weAudit.openGithubIssue", entry);
}

export async function sendBugsToWeAudit(bugs: ExportedResult[]) {
    // Ensure that the weAudit extension is installed
    if (!isWeAuditInstalled()) {
        throw new WeAuditNotInstalledError();
    }

    // Group bugs by rule
    const bugsByRule = new Map<string, ExportedResult[]>();
    for (const bug of bugs) {
        const ruleName = bug.rule.name;
        if (!bugsByRule.has(ruleName)) {
            bugsByRule.set(ruleName, []);
        }

        bugsByRule.get(ruleName)!.push(bug);
    }

    const entries: Entry[] = [];
    for (const [_, bugs] of bugsByRule) {
        const entry = await exportedResultsToEntry(bugs);
        entries.push(entry);
    }

    // Call the `weAudit.externallyLoadFindings` command of the weAudit extension
    await vscode.commands.executeCommand("weAudit.externallyLoadFindings", entries);
}
