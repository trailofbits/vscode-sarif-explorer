import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

type FilePathAndContents = {
    filePath: string;
    fileContents: string;
};

// Opens a SARIF file and return its contents
export function openSarifFile(sarifFilePath: string): FilePathAndContents {
    // Validate that the file is a SARIF file
    if (!sarifFilePath.endsWith(".sarif")) {
        throw new Error("Not a SARIF file");
    }

    // Check that the file exists
    if (!fs.existsSync(sarifFilePath)) {
        throw new Error("File does not exist");
    }

    // Fetch the file contents
    const sarifFileContents = fs.readFileSync(sarifFilePath, "utf8");
    return {
        filePath: sarifFilePath,
        fileContents: sarifFileContents,
    };
}

// Resolves a path given to the `sarif-explorer.openSarifFile` command. A relative path is resolved
// against the workspace folders: the first one in which it exists, or the first one if it exists in
// none. This lets a task, keybinding or another extension name a file in the workspace without
// knowing where the workspace is (VSCode does not substitute variables in command arguments).
// An absolute path, or any path when there is no workspace folder, is returned as it is.
export function resolveWorkspacePath(filePath: string, workspaceFolders: readonly string[]): string {
    if (path.isAbsolute(filePath) || workspaceFolders.length === 0) {
        return filePath;
    }

    for (const workspaceFolder of workspaceFolders) {
        const candidatePath = path.join(workspaceFolder, filePath);
        if (fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }
    return path.join(workspaceFolders[0], filePath);
}

export async function openSarifFileDialog(): Promise<string[]> {
    const options: vscode.OpenDialogOptions = {
        defaultUri: vscode.workspace.workspaceFolders?.at(0)?.uri || undefined,
        canSelectMany: true,
        openLabel: "Open SARIF file",
        filters: {
            sarif: ["sarif"],
        },
    };

    const filePaths: string[] = [];
    await vscode.window.showOpenDialog(options).then((fileUris) => {
        for (const fileUri of fileUris || []) {
            filePaths.push(fileUri.fsPath);
        }
    });

    return filePaths;
}
