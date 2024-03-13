export type Rule = {
    id: string;
    name: string;
    level: ResultLevel;

    shortDescription: string;
    fullDescription: string;
    help: string;
    helpURI: string;

    toolName: string;

    // Indicates if the rule is hidden in the UI
    isHidden: boolean;
};

export enum ResultLevel {
    error,
    warning,
    note,
    none,

    default, // This represents a rule without a level. By default it should be handled as a warning
}

export type LabeledLocation = {
    label: string;
    location: ResultLocation;
};

export type ResultLocation = {
    path: string;
    region: ResultRegion;
};

export type ResultRegion = {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
};

/* eslint-disable @typescript-eslint/naming-convention */
export enum ResultStatus {
    Todo = 0,
    FalsePositive = 1,
    Bug = 2,
}
/* eslint-enable @typescript-eslint/naming-convention */

export type ResultNote = {
    comment: string;
    status: ResultStatus;
};

export type ResultNotes = {
    [key: string]: ResultNote;
};

export type DataFlowElement = {
    message: string;
    location: ResultLocation;
};

export const DEFAULT_NOTES_COMMENT = "";
export const DEFAULT_NOTES_STATUS: ResultStatus = ResultStatus.Todo;

// ====================
// The type we export from our Result class to be passed to the extension
export type ExportedResult = {
    sarifPath: string;
    level: ResultLevel;
    rule: Rule;
    message: string;
    locations: ResultLocation[];
    dataFlow: DataFlowElement[];
    note: ResultNote;
};

// ====================
// VSCode config types and defaults
export type VSCodeConfig = {
    showFullPathInResultsTable: boolean;
};

export function defaultVSCodeConfig(): VSCodeConfig {
    return { showFullPathInResultsTable: false };
}
