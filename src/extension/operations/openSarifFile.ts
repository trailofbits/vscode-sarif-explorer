import * as vscode from "vscode";
import * as fs from "fs";

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
