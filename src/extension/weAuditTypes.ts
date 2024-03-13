// ====================
// Github Issue Creation
// create an enum with two values
export enum FindingSeverity {
    Informational = "Informational",
    Undetermined = "Undetermined",
    Low = "Low",
    Medium = "Medium",
    High = "High",
    Undefined = "",
}

export enum FindingDifficulty {
    Undetermined = "Undetermined",
    NA = "N/A",
    Low = "Low",
    Medium = "Medium",
    High = "High",
    Undefined = "",
}

export enum FindingType {
    AccessControls = "Access Controls",
    AuditingAndLogging = "Auditing and Logging",
    Authentication = "Authentication",
    Configuration = "Configuration",
    Cryptography = "Cryptography",
    DataExposure = "Data Exposure",
    DataValidation = "Data Validation",
    DenialOfService = "Denial of Service",
    ErrorReporting = "Error Reporting",
    Patching = "Patching",
    SessionManagement = "Session Management",
    Testing = "Testing",
    Timing = "Timing",
    UndefinedBehavior = "Undefined Behavior",
    Undefined = "",
}

export enum EntryType {
    Finding,
    Note,
    PathOrganizer,
}

export interface EntryDetails {
    severity: FindingSeverity;
    difficulty: FindingDifficulty;
    type: FindingType;
    description: string;
    exploit: string;
    recommendation: string;
}

/**
 * A location in a file.
 */
export interface Location {
    /** The path relative to the base git directory */
    path: string;

    /** The line where the entry starts */
    startLine: number;

    /** The line where the entry ends */
    endLine: number;

    /** The label of the location */
    label: string;

    /** The description of the location. This is currently used only when externally loading entries */
    description: string;
}

/**
 * Represents an entry in the finding tree.
 */
export interface Entry {
    /** The title of the entry */
    label: string;

    /** The type of the entry (finding or note) */
    entryType: EntryType;

    /** The author of the entry */
    author: string;

    /** The details of the entry */
    details: EntryDetails;

    /** Locations */
    locations: Location[];
}
