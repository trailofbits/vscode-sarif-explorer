import { ResultRegion } from "../../shared/resultTypes";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

export class SarifResultPathIsAbsolute extends Error {
    constructor(filePath: string) {
        super(
            `Result path is absolute but does not exist (${filePath}). ` +
                "The SARIF file must have been generated on another machine or moved from its original location. " +
                "As a workaround, you can open the SARIF file in your text editor and replace the old absolute path prefix with the path where you have the code on your machine",
        );
        this.name = "SarifResultPathIsAbsolute";
    }
}

export class BaseFolderIsIncorrectError extends Error {
    constructor(filePath: string, resultsBaseFolder: string) {
        super(`The user-provided base path ('${resultsBaseFolder}') plus the result's relative path ('${filePath}') does not exist`);
        this.name = "BaseFolderIsIncorrectError";
    }
}

export class BaseFolderCouldNotBeDeterminedError extends Error {
    constructor(filePath: string) {
        super(`Could not determine the result's base folder based on several heuristics for the path '${filePath}'`);
        this.name = "BaseFolderCouldNotBeDeterminedError";
    }
}

export class BaseFolderSelectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BaseFolderSelectionError";
    }
}

type UriAndBaseFolder = {
    uri: vscode.Uri;
    baseFolder: string;
};

// Reveal a code region in a file
export async function openCodeRegion(resultPath: string, region: ResultRegion, baseFolder: string, potentialBaseFolders: string[]): Promise<string> {
    // get file uri associated with resultPath
    const resultFileUriAndBaseFolder = await getResultFileUri(resultPath, baseFolder, potentialBaseFolders);

    // open file with the given range
    openResource(resultFileUriAndBaseFolder.uri, region);

    return resultFileUriAndBaseFolder.baseFolder;
}

export async function getResultFileUri(filePath: string, resultsBaseFolder: string, potentialBaseFolders: string[]): Promise<UriAndBaseFolder> {
    // Gets the path from the file URI (needed on Windows to replace `/` with `\` and more)
    if (filePath.startsWith("file://")) {
        filePath = fileURLToPath(filePath);
    }

    // If running on WSL, replace `C:` or `/C:` with `/mnt/c`
    const isRunningOnWSL = vscode.env.remoteName === "wsl";
    if (isRunningOnWSL) {
        filePath = filePath.replace(/^\/?([A-Za-z]):\//, "/mnt/$1/");
    }

    if (path.isAbsolute(filePath)) {
        // if the file is absolute and it exists, open it
        if (!fs.existsSync(filePath)) {
            // TODO: We could have a complex way to allow these SARIF files to became relative if necessary
            throw new SarifResultPathIsAbsolute(filePath);
        }

        return {
            uri: vscode.Uri.file(filePath),
            baseFolder: resultsBaseFolder,
        };
    }

    // The path is relative
    if (resultsBaseFolder !== "") {
        // Relative and a base directory was provided, open it relative to the base directory
        const absolutePath = path.join(resultsBaseFolder, filePath);
        if (fs.existsSync(absolutePath)) {
            return {
                uri: vscode.Uri.file(absolutePath),
                baseFolder: resultsBaseFolder,
            };
        } else {
            throw new BaseFolderIsIncorrectError(filePath, resultsBaseFolder);
        }
    }

    // Try to find the base folder using heuristics
    const heuristicUriAndBaseFolder = findBaseFolderWithHeuristics(filePath, potentialBaseFolders);
    if (heuristicUriAndBaseFolder) {
        return heuristicUriAndBaseFolder;
    }

    // If nothing else worked, ask the user to provide base folder
    throw new BaseFolderCouldNotBeDeterminedError(filePath);
}

function findBaseFolderWithHeuristics(filePath: string, potentialBaseFolders: string[]): UriAndBaseFolder | undefined {
    // Check based on other SARIF file's base folder
    for (const folder of potentialBaseFolders) {
        const absolutePath = path.join(folder, filePath);
        if (fs.existsSync(absolutePath)) {
            return {
                uri: vscode.Uri.file(absolutePath),
                baseFolder: folder,
            };
        }
    }

    // Try the currently open workspace folders
    if (vscode.workspace.workspaceFolders !== undefined) {
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const workspaceFolderPath = workspaceFolder.uri.fsPath;
            const absolutePath = path.join(workspaceFolderPath, filePath);
            if (fs.existsSync(absolutePath)) {
                return {
                    uri: vscode.Uri.file(absolutePath),
                    baseFolder: workspaceFolderPath,
                };
            }
        }
    }

    return undefined;
}

export async function openBaseFolderDialog(filePath: string): Promise<UriAndBaseFolder> {
    const baseFolder = await vscode.window.showOpenDialog({
        defaultUri: vscode.workspace.workspaceFolders?.at(0)?.uri || undefined,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select base folder for SARIF results",
    });

    if (!baseFolder || baseFolder.length === 0) {
        throw new BaseFolderSelectionError("Unable to select base folder");
    }

    const baseFolderUri = baseFolder[0];

    const absolutePath = path.join(baseFolderUri.fsPath, filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new BaseFolderSelectionError(`Path "${absolutePath}" does not exist`);
    }

    return {
        uri: vscode.Uri.file(absolutePath),
        baseFolder: baseFolderUri.fsPath,
    };
}

// ====================
// Showing the region-related functions
// If document is already open, it should not be opened again. Instead, the selection should be changed.
function openResource(resource: vscode.Uri, region: ResultRegion): void {
    const vscodeRegion = regionToVscodeRegion(region);
    if (
        vscode.window.activeTextEditor === undefined ||
        (vscode.window.activeTextEditor !== undefined && vscode.window.activeTextEditor.document.fileName !== resource.fsPath)
    ) {
        vscode.window.showTextDocument(resource, {
            viewColumn: vscode.ViewColumn.One,
            selection: vscodeRegion,
            preserveFocus: true,
        });
    } else {
        vscode.window.activeTextEditor.revealRange(vscodeRegion, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        vscode.window.activeTextEditor.selection = new vscode.Selection(vscodeRegion.start, vscodeRegion.end);
    }
}

function regionToVscodeRegion(region: ResultRegion): vscode.Range {
    return new vscode.Range(region.startLine - 1, region.startColumn - 1, region.endLine - 1, region.endColumn - 1);
}
