import * as vscode from "vscode";
import { SarifExplorerWebview } from "./sarifExplorerWebview";
import { resolveWorkspacePath } from "./operations/openSarifFile";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext): void {
    const sarifExplorer = new SarifExplorerWebview(context);

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.showSarifExplorer", (): void => {
            void sarifExplorer.show();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.openSarifFile", (sarifPath?: string, baseFolder?: string): void => {
            if (sarifPath) {
                // Relative paths are relative to the workspace (see resolveWorkspacePath)
                const workspaceFolders = (vscode.workspace.workspaceFolders ?? [])
                    .filter((workspaceFolder) => workspaceFolder.uri.scheme === "file")
                    .map((workspaceFolder) => workspaceFolder.uri.fsPath);
                sarifExplorer.addSarifToToOpenList(
                    resolveWorkspacePath(sarifPath, workspaceFolders),
                    baseFolder ? resolveWorkspacePath(baseFolder, workspaceFolders) : undefined,
                );
                void sarifExplorer.show();
            } else {
                void sarifExplorer.show();
                void sarifExplorer.launchOpenSarifFileDialogAndSendToWebview();
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.resetWorkspaceData", (): void => {
            // This command is useful if SARIF Explorer gets stuck in a bad state
            void sarifExplorer.resetWorkspaceData();
        }),
    );

    // load a SARIF file when it is opened
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document): void => {
            if (document.fileName.endsWith(".sarif")) {
                sarifExplorer.addSarifToToOpenList(document.fileName);
                void sarifExplorer.show();
            }
        }),
    );

    // When we're loading for the first time, we need to check if there are SARIF files open
    // (otherwise, the extension would not automatically open the webview because the onDidOpenTextDocument
    // handler above was still not registered)
    let shouldShowWebview = false;
    vscode.workspace.textDocuments.forEach((document): void => {
        if (document.fileName.endsWith(".sarif")) {
            sarifExplorer.addSarifToToOpenList(document.fileName);
            shouldShowWebview = true;
        }
    });
    if (shouldShowWebview) {
        void sarifExplorer.show();
    }
}

// This method is called when your extension is deactivated

export function deactivate(): void {}
