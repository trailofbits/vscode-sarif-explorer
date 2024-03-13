import { ExportedResult, ResultLocation } from "../shared/resultTypes";
import {
    CloseSarifFile,
    CopyPermalink,
    OpenGitHubIssue,
    FailedToParseSarifFile,
    OpenSarifFile,
    SetResultsBaseFolder,
    OpenCodeRegion,
    SendBugsToWeAudit,
    SetHiddenRule,
    SetResultNote,
    WebviewIsReady,
    LaunchOpenSarifFileDialog,
    SetFilterData,
} from "../shared/webviewMessageTypes";
import { Result } from "./result/result";
import { SarifFile } from "./sarifFile/sarifFile";
import { vscode } from "./vscode";
import { FilterData } from "../shared/filterData";

export function apiWebviewIsReady() {
    const msg: WebviewIsReady = {
        command: "webviewIsReady",
    };
    vscode.postMessage(msg);
}

export function apiLaunchOpenSarifFileDialog() {
    // The main extension will handle opening the dialog and returning the file path to the webview
    const msg: LaunchOpenSarifFileDialog = {
        command: "launchOpenSarifFileDialog",
    };
    vscode.postMessage(msg);

    // NOTE: The response handler will handle the response
}

export function apiOpenSarifFile(sarifFilePath: string) {
    const msg: OpenSarifFile = {
        command: "openSarifFile",
        sarifFilePath: sarifFilePath,
    };
    vscode.postMessage(msg);

    // NOTE: The response handler will handle the response
}

export function apiFailedToParseSarifFile(sarifFilePath: string, error: string) {
    const msg: FailedToParseSarifFile = {
        command: "failedToParseSarifFile",
        sarifFilePath: sarifFilePath,
        error: error,
    };
    vscode.postMessage(msg);
}

export function apiCloseSarifFile(sarifFilePath: string) {
    const msg: CloseSarifFile = {
        command: "closeSarifFile",
        sarifFilePath: sarifFilePath,
    };
    vscode.postMessage(msg);
}

export function apiSetResultsBaseFolder(sarifFilePath: string, resultsBaseFolder: string) {
    const msg: SetResultsBaseFolder = {
        command: "setResultsBaseFolder",
        sarifFilePath: sarifFilePath,
        resultsBaseFolder: resultsBaseFolder,
    };
    vscode.postMessage(msg);
}

export function apiOpenCodeRegion(sarifFile: SarifFile, location: ResultLocation) {
    const sarifFilePath = sarifFile.getSarifFilePath();
    const resultsBaseFolder = sarifFile.getResultsBaseFolder();

    const msg: OpenCodeRegion = {
        command: "openCodeRegion",
        sarifFilePath: sarifFilePath,
        resultsBaseFolder: resultsBaseFolder,

        resultFilePath: location.path,
        resultRegion: location.region,
    };
    vscode.postMessage(msg);
}

export function apiSetResultNote(result: Result) {
    const msg: SetResultNote = {
        command: "setResultNote",
        sarifFilePath: result.getAssociatedSarifPath(),
        resultId: result.getResultId(),
        note: {
            status: result.getStatus(),
            comment: result.getComment(),
        },
    };
    vscode.postMessage(msg);
}

export function apiSetHiddenRule(sarifFilePath: string, ruleId: string, isHidden: boolean) {
    const msg: SetHiddenRule = {
        command: "setHiddenRule",
        sarifFilePath: sarifFilePath,
        ruleId: ruleId,
        isHidden: isHidden,
    };
    vscode.postMessage(msg);
}

export function apiSendBugsToWeAudit(bugs: Result[]) {
    const msg: SendBugsToWeAudit = {
        command: "sendBugsToWeAudit",
        bugs: bugs.map((bug) => {
            return resultToExportedResult(bug);
        }),
    };
    vscode.postMessage(msg);
}

export function apiCopyPermalink(result: Result) {
    const msg: CopyPermalink = {
        command: "copyPermalink",
        sarifFilePath: result.getAssociatedSarifPath(),
        location: result.getResultPrimaryLocation(),
    };
    vscode.postMessage(msg);
}

export function apiSetFilterData(filterData: FilterData) {
    const msg: SetFilterData = {
        command: "setFilterData",
        filterData: filterData,
    };
    vscode.postMessage(msg);
}

function resultToExportedResult(result: Result): ExportedResult {
    return {
        sarifPath: result.getAssociatedSarifPath(),
        level: result.getLevel(),
        rule: result.getRule(),
        message: result.getMessage(),
        locations: result.getLocations(),
        dataFlow: result.getDataFlow(),
        note: result.getNote(),
    } as ExportedResult;
}

export function apiExportGitHubIssue(bugs: Result[]) {
    const msg: OpenGitHubIssue = {
        command: "openGitHubIssue",
        bugs: bugs.map((bug) => {
            return resultToExportedResult(bug);
        }),
    };
    vscode.postMessage(msg);
}
