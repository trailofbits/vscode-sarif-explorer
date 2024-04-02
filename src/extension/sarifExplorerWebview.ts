import * as vscode from "vscode";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";

import {
    WebviewToExtensionMsgTypes,
    OpenSarifFileResponse,
    ExtensionToWebviewMsgTypes,
    OpenCodeRegion,
    SetSarifFileBaseFolder,
    WebviewIsReadyResponse,
} from "../shared/webviewMessageTypes";
import { openSarifFile, openSarifFileDialog } from "./operations/openSarifFile";
import {
    BaseFolderCouldNotBeDeterminedError,
    BaseFolderIsIncorrectError,
    getResultFileUri,
    openBaseFolderDialog,
    openCodeRegion,
} from "./operations/openCodeRegion";
import { SarifFileMetadata, SarifFileWorkspaceData } from "./operations/handleSarifNotes";
import { getPathLeaf } from "../shared/file";
import { FilterData } from "../shared/filterData";
import {
    WeAuditNotInstalledError,
    getGitHubPermalink,
    openGithubIssueFromResults,
    sendBugsToWeAudit,
} from "./weAuditInterface";
import { ExportedResult, ResultLocation, defaultVSCodeConfig } from "../shared/resultTypes";

export class SarifExplorerWebview {
    private _webview: vscode.WebviewPanel | null = null;
    private _context: vscode.ExtensionContext;
    private _title = "SARIF Explorer";
    private _filesToOpen: Map<string, SarifFileWorkspaceData> = new Map();
    private _openedSarifFiles: Map<string, SarifFileMetadata> = new Map();
    private _webviewIsReady = false;
    private vscodeConfig = defaultVSCodeConfig();

    private BUG_IN_SARIF_EXPLORER_MSG =
        "This is likely a SARIF Explorer bug, please open an issue at https://github.com/trailofbits/vscode-sarif-explorer/issues.";

    private WORKSPACE_STORAGE_OPENED_SARIF_FILES_KEY = "openedSarifFiles";
    private WORKSPACE_STORAGE_FILTER_DATA_KEY = "filterData";
    private WORKSPACE_STORAGE_IS_VISIBLE_KEY = "isVisible";

    constructor(context: vscode.ExtensionContext) {
        // vscode show message "hola amigo"
        vscode.window.showInformationMessage("hola amigo");
        this._context = context;

        this.loadWorkspaceSarifFiles();

        this.loadVSCodeConfig();
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            this.updateVSCodeConfig(e);
        });
    }

    // ====================
    // VSCode Config
    // ====================
    private loadVSCodeConfig() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.vscodeConfig.showFullPathInResultsTable = vscode.workspace
            .getConfiguration("sarif-explorer")
            .get("showFullPathInResultsTable")!;
    }

    private updateVSCodeConfig(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration("sarif-explorer.showFullPathInResultsTable")) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.vscodeConfig.showFullPathInResultsTable = vscode.workspace
                .getConfiguration("sarif-explorer")
                .get("showFullPathInResultsTable")!;
            this.postMessage({ command: "updateVSCodeConfig", vscodeConfig: this.vscodeConfig });
        }
    }

    // ====================
    // Workspace Storage
    // ====================
    private getWorkspaceOpenedSarifFiles(): { [s: string]: SarifFileWorkspaceData } {
        // Load the list of opened SARIF files from the workspace storage
        const res = this._context.workspaceState.get<{ [s: string]: SarifFileWorkspaceData }>(
            this.WORKSPACE_STORAGE_OPENED_SARIF_FILES_KEY,
            {},
        );
        return res;
    }

    private async updateWorkspaceOpenedSarifFiles() {
        const updatedOpenedSarifFiles: { [s: string]: SarifFileWorkspaceData } = {};
        for (const [sarifFilePath, sarifFileMetadata] of this._openedSarifFiles) {
            updatedOpenedSarifFiles[sarifFilePath] = sarifFileMetadata.getWorkspaceMetadata();
        }
        return this._context.workspaceState.update(
            this.WORKSPACE_STORAGE_OPENED_SARIF_FILES_KEY,
            updatedOpenedSarifFiles,
        );
    }

    private loadWorkspaceSarifFiles() {
        const openedSarifFiles = this.getWorkspaceOpenedSarifFiles();
        if (Object.keys(openedSarifFiles).length > 0) {
            for (const [sarifFilePath, sarifFileWorkspaceMetadata] of Object.entries(openedSarifFiles)) {
                if (!fs.existsSync(sarifFilePath)) {
                    continue;
                }
                this._filesToOpen.set(sarifFilePath, sarifFileWorkspaceMetadata);
            }

            if (this.getWorkspaceIsVisible()) {
                this.show();
            }
        }
    }

    private getWorkspaceFilterData(): FilterData {
        // Load the filter data from the workspace storage
        const res = this._context.workspaceState.get<FilterData>(this.WORKSPACE_STORAGE_FILTER_DATA_KEY, {
            keyword: "",
            includePaths: [],
            excludePaths: [],
            excludeRuleIds: [],
            excludeSarifFiles: [],

            includeLevelError: true,
            includeLevelWarning: true,
            includeLevelNote: true,
            includeLevelNone: true,

            includeStatusTodo: true,
            includeStatusFalsePositive: true,
            includeStatusBug: true,
        });

        return res;
    }

    private updateWorkspaceFilterData(filterData: FilterData) {
        // Save the filter data to the workspace storage
        this._context.workspaceState.update(this.WORKSPACE_STORAGE_FILTER_DATA_KEY, filterData);
    }

    private getWorkspaceIsVisible(): boolean {
        return this._context.workspaceState.get<boolean>(this.WORKSPACE_STORAGE_IS_VISIBLE_KEY, false);
    }

    private updateWorkspaceIsVisible(isVisible: boolean) {
        this._context.workspaceState.update(this.WORKSPACE_STORAGE_IS_VISIBLE_KEY, isVisible);
    }

    public async resetWorkspaceData() {
        // Reset the workspace storage
        await this._context.workspaceState.update(this.WORKSPACE_STORAGE_OPENED_SARIF_FILES_KEY, {});
        await this._context.workspaceState.update(this.WORKSPACE_STORAGE_FILTER_DATA_KEY, {
            keyword: "",
            includePaths: [],
            excludePaths: [],
            excludeRuleIds: [],
            excludeSarifFiles: [],

            includeLevelError: true,
            includeLevelWarning: true,
            includeLevelNote: true,
            includeLevelNone: true,

            includeStatusTodo: true,
            includeStatusFalsePositive: true,
            includeStatusBug: true,
        });
    }

    private getPotentialBaseFolders(sarifFilePath: string) {
        const allOpenedBaseFolders = new Set<string>();
        for (const sarifFileMetadata of this._openedSarifFiles.values()) {
            allOpenedBaseFolders.add(sarifFileMetadata.getBaseFolder());
        }
        return [path.dirname(sarifFilePath), ...Array.from(allOpenedBaseFolders)];
    }

    // To ensure the file is actually opened, you need to call `.show`
    public addSarifToToOpenList(sarifFilePath: string, baseFolder = "") {
        this._filesToOpen.set(sarifFilePath, { baseFolder: baseFolder });
    }

    // Function that shows the webview panel
    public async show() {
        this.updateWorkspaceIsVisible(true);

        if (this._webview) {
            if (!this._webview.active) {
                this._webview.reveal(undefined, true);
            }

            // We need this here in case someone adds files to the _filesToOpen list and the
            // webview has already called webviewIsReady
            if (this._webviewIsReady) {
                // Send the list of opened SARIF files to the webview
                for (const [sarifFilePath, workspaceData] of this._filesToOpen) {
                    this._filesToOpen.delete(sarifFilePath);
                    this.openSarifFileAndSendToWebview(sarifFilePath, workspaceData);
                }
            }

            return;
        }

        // Create the webview panel
        this._webview = vscode.window.createWebviewPanel(
            "sarifExplorer.webview",
            this._title,
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
            {
                // Retain the webview's state when hidden
                // This does NOT retain the webview's state when the webview is closed
                retainContextWhenHidden: true,
            },
        );

        this._webview.webview.options = {
            // Enable script in the Webview
            enableScripts: true,
            // Prevent the Webview from accessing files outside of the extension's directory
            localResourceRoots: [this._context.extensionUri],
        };

        this._webview.webview.html = this._getHtml(this._webview.webview);

        // Setup the message the handler for Webview post messages
        this._webview.webview.onDidReceiveMessage((message) => this._handleMessages(message));

        this._webview.onDidDispose(() => {
            this._webview = null;
            this._webviewIsReady = false;
            this.updateWorkspaceIsVisible(false);
        });
    }

    // Generate a cryptographically-safe nonce for use in the webview's CSP
    private _getNonce() {
        return crypto.randomBytes(16).toString("base64");
    }

    // Return the HTML for the webview
    private _getHtml(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, "dist", "webview.js"));

        // Use a nonce to only allow a specific script to be run.
        const nonce = this._getNonce();

        // read the html file from path main.html
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const bodyHtml = require("../webviewSrc/main.html");

        return `<!DOCTYPE html>
		<html lang="en">
		<head>
		    <meta charset="UTF-8">
		    <meta http-equiv="Content-Security-Policy" content="
				    default-src 'none';
                    base-uri 'none';
				    connect-src ${webview.cspSource};
				    script-src 'nonce-${nonce}';
                    font-src ${webview.cspSource};
                    style-src 'unsafe-inline' ${webview.cspSource};
				">
		    <title>${this._title}</title>

		</head>
        <body>
            ${bodyHtml}
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    public async postMessage(msg: ExtensionToWebviewMsgTypes) {
        if (this._webview) {
            this._webview.webview.postMessage(msg);
        } else {
            console.error(
                "[SARIF Explorer] Trying to post message to webview when it is not open. " +
                    this.BUG_IN_SARIF_EXPLORER_MSG,
            );
        }
    }

    private async updatedRelativeLocationToAbsolute(sarifFileMetadata: SarifFileMetadata, location: ResultLocation) {
        const newPath = (
            await getResultFileUri(
                location.path,
                sarifFileMetadata.getBaseFolder(),
                this.getPotentialBaseFolders(sarifFileMetadata.getSarifFilePath()),
            )
        ).uri.path;
        location.path = newPath;
    }

    private async updateResultPathsToAbsolute(sarifFileMetadata: SarifFileMetadata, result: ExportedResult) {
        for (let i = 0; i < result.locations.length; i++) {
            await this.updatedRelativeLocationToAbsolute(sarifFileMetadata, result.locations[i]);
        }

        for (let i = 0; i < result.dataFlow.length; i++) {
            await this.updatedRelativeLocationToAbsolute(sarifFileMetadata, result.dataFlow[i].location);
        }
    }

    private async _handleMessages(msg: WebviewToExtensionMsgTypes) {
        // console.debug("[Extension] Received a '" + msg.command + "'");
        // console.debug("[Extension] Received message from webview: ", msg);

        switch (msg.command) {
            case "webviewIsReady": {
                this._webviewIsReady = true;

                // Send the filter data to the webview
                const filterData = this.getWorkspaceFilterData();
                const webviewIsReadyMsg: WebviewIsReadyResponse = {
                    command: "webviewIsReadyResponse",
                    filterData: filterData,
                    vscodeConfig: this.vscodeConfig,
                };
                this.postMessage(webviewIsReadyMsg);

                // This is necessary to reopen files when the files that we have loaded when the webview is closed and re-opened
                for (const [sarifFilePath, sarifFileMetadata] of this._openedSarifFiles) {
                    this.openSarifFileAndSendToWebview(sarifFilePath, sarifFileMetadata.getWorkspaceMetadata());
                }

                // Send the list of opened SARIF files to the webview
                for (const [sarifFilePath, workspaceData] of this._filesToOpen) {
                    this._filesToOpen.delete(sarifFilePath);
                    this.openSarifFileAndSendToWebview(sarifFilePath, workspaceData);
                }

                break;
            }
            case "setFilterData": {
                // Save the filter data on the workspace storage
                this.updateWorkspaceFilterData(msg.filterData);
                break;
            }
            case "openSarifFile": {
                this.openSarifFileAndSendToWebview(msg.sarifFilePath, { baseFolder: "" });
                break;
            }
            case "launchOpenSarifFileDialog": {
                this.launchOpenSarifFileDialogAndSendToWebview();
                break;
            }
            case "closeSarifFile": {
                this._openedSarifFiles.delete(msg.sarifFilePath);
                this.updateWorkspaceOpenedSarifFiles();
                break;
            }
            case "setResultsBaseFolder": {
                const sarifFileMetadata = this._openedSarifFiles.get(msg.sarifFilePath);
                if (!sarifFileMetadata) {
                    console.error(
                        "[SARIF Explorer] Trying to set results base folder on a SARIF file that is not open. " +
                            this.BUG_IN_SARIF_EXPLORER_MSG,
                    );
                    return;
                }
                sarifFileMetadata.setBaseFolder(msg.resultsBaseFolder);
                this.updateWorkspaceOpenedSarifFiles();
                break;
            }
            case "failedToParseSarifFile": {
                const sarifFileMetadata = this._openedSarifFiles.get(msg.sarifFilePath);
                if (!sarifFileMetadata) {
                    console.error(
                        "[SARIF Explorer] Trying to create an error message for a SARIF file that is not opened. " +
                            this.BUG_IN_SARIF_EXPLORER_MSG,
                    );
                    return;
                }
                this._openedSarifFiles.delete(msg.sarifFilePath);
                this.updateWorkspaceOpenedSarifFiles();

                const errorMsg = `Failed to load "${getPathLeaf(msg.sarifFilePath)}": ${msg.error}.`;
                vscode.window.showErrorMessage(errorMsg);
                break;
            }
            case "setResultNote": {
                const sarifFileMetadata = this._openedSarifFiles.get(msg.sarifFilePath);
                if (!sarifFileMetadata) {
                    console.error(
                        "[SARIF Explorer] Trying to set note on a SARIF file that is not open. " +
                            this.BUG_IN_SARIF_EXPLORER_MSG,
                    );
                    return;
                }
                sarifFileMetadata.setResultNote(msg.resultId, msg.note);
                break;
            }
            case "setHiddenRule": {
                const sarifFileMetadata = this._openedSarifFiles.get(msg.sarifFilePath);
                if (!sarifFileMetadata) {
                    console.error(
                        "[SARIF Explorer] Trying to set a hidden rule on a SARIF file that is not open. " +
                            this.BUG_IN_SARIF_EXPLORER_MSG,
                    );
                    return;
                }
                sarifFileMetadata.setHiddenRule(msg.ruleId, msg.isHidden);
                break;
            }
            case "openCodeRegion": {
                this.handleOpenCodeRegion(msg);
                break;
            }
            case "sendBugsToWeAudit": {
                // For each bug, transform its path into a absolute path
                let bug: ExportedResult;
                try {
                    for (bug of msg.bugs) {
                        const sarifFileMetadata = this._openedSarifFiles.get(bug.sarifPath);
                        if (!sarifFileMetadata) {
                            console.error(
                                "[SARIF Explorer] Trying to send bugs to weAudit from a SARIF file that is not open. " +
                                    this.BUG_IN_SARIF_EXPLORER_MSG,
                            );
                            return;
                        }
                        await this.updateResultPathsToAbsolute(sarifFileMetadata, bug);
                    }
                    await sendBugsToWeAudit(msg.bugs);
                } catch (err) {
                    const errorMsg = "Failed to send bugs to weAudit";
                    if (err instanceof BaseFolderIsIncorrectError) {
                        this.handleBaseFolderIsIncorrectError(
                            err,
                            errorMsg,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            bug!.sarifPath,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            bug!.locations.at(0)?.path || "",
                        );
                    } else if (err instanceof WeAuditNotInstalledError) {
                        err.showInstallWeAuditVSCodeError(errorMsg);
                    } else {
                        vscode.window.showErrorMessage(`${errorMsg}: ${err}.`);
                    }
                    return;
                }

                break;
            }
            case "copyPermalink": {
                const sarifFileMetadata = this._openedSarifFiles.get(msg.sarifFilePath);
                if (!sarifFileMetadata) {
                    console.error(
                        "[SARIF Explorer] Trying to copy a permalink from a SARIF file that is not open." +
                            this.BUG_IN_SARIF_EXPLORER_MSG,
                    );
                    return;
                }

                try {
                    // Update the path to be absolute
                    await this.updatedRelativeLocationToAbsolute(sarifFileMetadata, msg.location);

                    const permalink = await getGitHubPermalink(
                        msg.location.region.startLine - 1,
                        msg.location.region.endLine - 1,
                        msg.location.path,
                    );

                    if (permalink === "") {
                        // Errors displayed from weAudit if an error occurred
                        return;
                    }

                    vscode.env.clipboard.writeText(permalink);
                } catch (err) {
                    const errorMsg = "Failed to copy the GitHub permalink with weAudit";
                    if (err instanceof BaseFolderIsIncorrectError) {
                        this.handleBaseFolderIsIncorrectError(err, errorMsg, msg.sarifFilePath, msg.location.path);
                    } else if (err instanceof WeAuditNotInstalledError) {
                        err.showInstallWeAuditVSCodeError(errorMsg);
                    } else {
                        vscode.window.showErrorMessage(`${errorMsg}: ${err}.`);
                    }
                }

                break;
            }
            case "openGitHubIssue": {
                if (msg.bugs.length === 0) {
                    vscode.window.showErrorMessage(
                        "Failed to Open GitHub Issue: Trying to open a GitHub issue but no results are visible.",
                    );
                    return;
                }

                let bug: ExportedResult;
                try {
                    // For each bug, transform its path into a absolute path
                    for (bug of msg.bugs) {
                        const sarifFileMetadata = this._openedSarifFiles.get(bug.sarifPath);
                        if (!sarifFileMetadata) {
                            console.error(
                                "[SARIF Explorer] Trying to open a GitHub issue on a SARIF file that is not open." +
                                    this.BUG_IN_SARIF_EXPLORER_MSG,
                            );
                            return;
                        }

                        await this.updateResultPathsToAbsolute(sarifFileMetadata, bug);
                    }

                    await openGithubIssueFromResults(msg.bugs);
                } catch (err) {
                    const errorMsg = "Failed to Open Github Issue with weAudit";
                    if (err instanceof BaseFolderIsIncorrectError) {
                        this.handleBaseFolderIsIncorrectError(
                            err,
                            errorMsg,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            bug!.sarifPath,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            bug!.locations.at(0)?.path || "",
                        );
                    } else if (err instanceof WeAuditNotInstalledError) {
                        err.showInstallWeAuditVSCodeError(errorMsg);
                    } else {
                        vscode.window.showErrorMessage(`${errorMsg}: ${err}.`);
                    }
                    return;
                }
                break;
            }
        }
    }

    public async launchOpenSarifFileDialogAndSendToWebview() {
        const sarifFilePaths = await openSarifFileDialog();

        // Failed to get a file path from the dialog; no need for an error message here
        if (sarifFilePaths.length === 0) {
            return;
        }

        // Open and send each selected file to the webview
        for (const filePath of sarifFilePaths) {
            this.openSarifFileAndSendToWebview(filePath, { baseFolder: "" });
        }
    }

    public async openSarifFileAndSendToWebview(sarifFilePath: string, sarifFileWorkspaceData: SarifFileWorkspaceData) {
        // Open and send the SARIF file to the webview
        let res;
        try {
            res = openSarifFile(sarifFilePath);
        } catch (err) {
            const errorMsg = `Failed to load "${getPathLeaf(sarifFilePath)}": ${err}.`;
            vscode.window.showErrorMessage(errorMsg);
            return;
        }

        // Mark the file as opened
        const sarifFileMetadata = new SarifFileMetadata(sarifFilePath, sarifFileWorkspaceData);
        this._openedSarifFiles.set(sarifFilePath, sarifFileMetadata);
        // Update the data in the workspace storage
        this.updateWorkspaceOpenedSarifFiles();

        // Send the file to the webview
        const sarifFileMsg: OpenSarifFileResponse = {
            command: "openSarifFileResponse",
            sarifFilePath: sarifFilePath,
            sarifFileContents: res.fileContents,
            resultNotes: sarifFileMetadata.getResultNotes(),
            hiddenRules: sarifFileMetadata.getHiddenRules(),
            baseFolder: sarifFileMetadata.getBaseFolder(),
        };
        this.postMessage(sarifFileMsg);
    }

    public async handleOpenCodeRegion(msg: OpenCodeRegion) {
        // Open the code region
        let newResultsBaseFolder;
        try {
            newResultsBaseFolder = await openCodeRegion(
                msg.resultFilePath,
                msg.resultRegion,
                msg.resultsBaseFolder,
                this.getPotentialBaseFolders(msg.sarifFilePath),
            );
        } catch (err) {
            const errorMsg = "Failed to open code region";
            if (err instanceof BaseFolderIsIncorrectError || err instanceof BaseFolderCouldNotBeDeterminedError) {
                this.handleBaseFolderIsIncorrectError(err, errorMsg, msg.sarifFilePath, msg.resultFilePath);
            } else {
                vscode.window.showErrorMessage(`${errorMsg}: ${err}.`);
            }
            return;
        }

        // Send the new results base folder to the webview if it changed
        if (newResultsBaseFolder && newResultsBaseFolder !== msg.resultsBaseFolder) {
            const sarifFileMsg: SetSarifFileBaseFolder = {
                command: "setSarifFileBaseFolder",
                sarifFilePath: msg.sarifFilePath,
                resultsBaseFolder: newResultsBaseFolder,
            };
            this.postMessage(sarifFileMsg);
        }
    }

    public async handleBaseFolderIsIncorrectError(
        err: BaseFolderIsIncorrectError | BaseFolderCouldNotBeDeterminedError,
        errorMsg: string,
        sarifFilePath: string,
        resultFilePath: string,
    ) {
        // If the base folder is incorrect, ask the user to select a new one
        vscode.window.showErrorMessage(`${errorMsg}: ${err}.`, "Select a new base folder").then(async (t) => {
            // Undefined means the error was dismissed
            if (t === undefined) {
                return;
            }

            let uriAndBaseFolder;
            try {
                uriAndBaseFolder = await openBaseFolderDialog(resultFilePath);
            } catch (err) {
                vscode.window.showErrorMessage(`${errorMsg}: ${err}.`);
                return;
            }

            const newResultsBaseFolder = uriAndBaseFolder.baseFolder;

            // Send the new results base folder to the webview if it changed
            const sarifFileMsg: SetSarifFileBaseFolder = {
                command: "setSarifFileBaseFolder",
                sarifFilePath: sarifFilePath,
                resultsBaseFolder: newResultsBaseFolder,
            };
            this.postMessage(sarifFileMsg);
        });
    }
}
