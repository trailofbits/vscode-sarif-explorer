import * as vscode from "vscode";
import { SarifExplorerWebview } from "./sarifExplorerWebview";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    const sarifExplorer = new SarifExplorerWebview(context);

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.showSarifExplorer", () => {
            void sarifExplorer.show();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.openSarifFile", (sarifPath: string, baseFolder: string) => {
            if (sarifPath) {
                sarifExplorer.addSarifToToOpenList(sarifPath, baseFolder);
                void sarifExplorer.show();
            } else {
                void sarifExplorer.show();
                void sarifExplorer.launchOpenSarifFileDialogAndSendToWebview();
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sarif-explorer.resetWorkspaceData", () => {
            // This command is useful if SARIF Explorer gets stuck in a bad state
            void sarifExplorer.resetWorkspaceData();
        }),
    );

    // load a SARIF file when it is opened
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
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
    vscode.workspace.textDocuments.forEach((document) => {
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

export function deactivate() {}
