import { FilterData } from "./filterData";
import { ResultRegion, ResultNote, ResultNotes, ResultLocation, ExportedResult, VSCodeConfig } from "./resultTypes";

export type ExtensionToWebviewMsgTypes =
    | OpenSarifFileResponse
    | SetSarifFileBaseFolder
    | WebviewIsReadyResponse
    | UpdateVSCodeConfig;

export type WebviewToExtensionMsgTypes =
    | WebviewIsReady
    | LaunchOpenSarifFileDialog
    | OpenSarifFile
    | CloseSarifFile
    | SetResultsBaseFolder
    | FailedToParseSarifFile
    | OpenCodeRegion
    | SetResultNote
    | SetHiddenRule
    | SendBugsToWeAudit
    | CopyPermalink
    | OpenGitHubIssue
    | SetFilterData;

// ====================
// ExtensionToWebviewMsgTypes
// ====================
// Message with the results asked in OpenSarifFile
export type OpenSarifFileResponse = {
    command: "openSarifFileResponse";
    sarifFilePath: string;
    sarifFileContents: string;
    resultNotes: ResultNotes;
    hiddenRules: string[];
    baseFolder: string;
};

// Message use to update the resultsBaseFolder of an opened SARIF file
export type SetSarifFileBaseFolder = {
    command: "setSarifFileBaseFolder";
    sarifFilePath: string;
    resultsBaseFolder: string;
};

// Initial start up information including the filter data
export type WebviewIsReadyResponse = {
    command: "webviewIsReadyResponse";
    filterData: FilterData;
    vscodeConfig: VSCodeConfig;
};

// Update the VS Code config
export type UpdateVSCodeConfig = {
    command: "updateVSCodeConfig";
    vscodeConfig: VSCodeConfig;
};

// ====================
// WebviewToExtensionMsgTypes
// ====================
// Message noting that the webview is ready to receive messages
export type WebviewIsReady = {
    command: "webviewIsReady";
};

// Set the filter data on the extension side
export type SetFilterData = {
    command: "setFilterData";
    filterData: FilterData;
};

// Message asking the extension for the contents of a SARIF file.
export type LaunchOpenSarifFileDialog = {
    command: "launchOpenSarifFileDialog";
};

// Message asking the extension for the contents of a SARIF file.
export type OpenSarifFile = {
    command: "openSarifFile";
    sarifFilePath: string;
};

// Message noting that the webview failed to parse a SARIF file
export type FailedToParseSarifFile = {
    command: "failedToParseSarifFile";
    sarifFilePath: string;
    error: string;
};

// Message noting that a SARIF file was closed
export type CloseSarifFile = {
    command: "closeSarifFile";
    sarifFilePath: string;
};

export type SetResultsBaseFolder = {
    command: "setResultsBaseFolder";
    sarifFilePath: string;
    resultsBaseFolder: string;
};

// Message asking the extension to open a file at a specific region
export type OpenCodeRegion = {
    command: "openCodeRegion";
    sarifFilePath: string;
    resultFilePath: string;
    resultRegion: ResultRegion;

    resultsBaseFolder: string;
};

// Message asking the extension to set the status and comment of a result
export type SetResultNote = {
    command: "setResultNote";
    sarifFilePath: string;
    resultId: string;
    note: ResultNote;
};

// Set that a rule was hidden
export type SetHiddenRule = {
    command: "setHiddenRule";
    sarifFilePath: string;
    ruleId: string;
    isHidden: boolean;
};
// Open the setting menu
export type SendBugsToWeAudit = {
    command: "sendBugsToWeAudit";
    bugs: ExportedResult[];
};

// Message to copy a permalink to the given path and lines
export type CopyPermalink = {
    command: "copyPermalink";
    sarifFilePath: string;
    location: ResultLocation;
};

export type OpenGitHubIssue = {
    command: "openGitHubIssue";
    bugs: ExportedResult[];
};
