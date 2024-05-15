import { SarifFile, Tool } from "../sarifFile/sarifFile";
import { normalizePath } from "../../shared/file";
import {
    DataFlowElement,
    LabeledLocation,
    ResultLevel,
    ResultLocation,
    ResultNote,
    ResultStatus,
    Rule,
} from "../../shared/resultTypes";
import { apiCopyPermalink, apiExportGitHubIssue, apiOpenCodeRegion, apiSetResultNote } from "../extensionApi";

export type ResultAndRow = {
    result: Result;
    row: HTMLTableRowElement;
};

export class Result {
    private resultId: string;
    private sarifFile: SarifFile;
    private runIndex: number;
    private level: ResultLevel;
    private ruleId: string;
    private message: string;
    private locations: ResultLocation[];
    private relatedLocations: Map<number, LabeledLocation>;
    private dataFlow: DataFlowElement[] = [];

    private note: ResultNote;

    constructor(
        resultId: string,
        sarifFile: SarifFile,
        runIndex: number,
        level: ResultLevel,
        ruleId: string,
        message: string,
        locations: ResultLocation[],
        relatedLocations: Map<number, LabeledLocation>,
        dataFlow: DataFlowElement[],
        status: ResultStatus,
        comment: string,
    ) {
        this.resultId = resultId;
        this.sarifFile = sarifFile;
        this.runIndex = runIndex;
        this.level = level;
        this.ruleId = ruleId;
        this.message = message;

        this.note = {
            status: status,
            comment: comment,
        };

        // Default to empty region if location is missing. This is allowed by the SARIF spec
        if (locations.length === 0) {
            const fakeEmptyLocation: ResultLocation = {
                path: "",
                region: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
            };
            locations.push(fakeEmptyLocation);
        }

        this.locations = locations;
        this.relatedLocations = relatedLocations;
        this.dataFlow = dataFlow;
    }

    public getLevel(): ResultLevel {
        return this.level === ResultLevel.default ? ResultLevel.warning : this.level;
    }

    public getLevelStr(): string {
        return ResultLevel[this.getLevel()];
    }

    public setLevel(level: ResultLevel) {
        return (this.level = level);
    }

    public getRule(): Rule {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.sarifFile.getRunRule(this.ruleId, this.runIndex)!;
    }

    public getRuleId(): string {
        return this.ruleId;
    }

    public getMessage(): string {
        return this.message;
    }

    public getResultId(): string {
        return this.resultId;
    }

    public getResultIdWithSarifPath(): string {
        return this.getAssociatedSarifPath() + "|" + this.getResultId();
    }

    public getNote(): ResultNote {
        return this.note;
    }

    public getStatus(): ResultStatus {
        return this.note.status;
    }

    public getStatusStr(): string {
        return ResultStatus[this.getStatus()];
    }

    public setStatus(status: ResultStatus) {
        this.note.status = status;
        apiSetResultNote(this);
    }

    public hasComment(): boolean {
        return this.note.comment !== "";
    }

    public getComment(): string {
        return this.note.comment;
    }

    public setComment(comment: string) {
        this.note.comment = comment;
        apiSetResultNote(this);
    }

    public getAssociatedSarifFile(): SarifFile {
        return this.sarifFile;
    }

    public getAssociatedRunIndex(): number {
        return this.runIndex;
    }

    public getAssociatedSarifPath(): string {
        return this.sarifFile.getSarifFilePath();
    }

    // Result method to get the primary location
    public getResultPrimaryLocation(): ResultLocation {
        return this.locations[0];
    }

    public getLocations(): ResultLocation[] {
        return this.locations;
    }

    // Result method to get the primary location
    public getLine(): number {
        return this.getResultPrimaryLocation().region.startLine;
    }

    public getTool(): Tool {
        return this.getAssociatedSarifFile().getRunTool(this.getAssociatedRunIndex());
    }

    public getResultPath(): string {
        return this.getResultPrimaryLocation().path;
    }

    public getResultNormalizedPath(): string {
        return normalizePath(this.getResultPath(), this.sarifFile.getResultsBaseFolder());
    }

    public getRelatedLocations(): Map<number, LabeledLocation> {
        return this.relatedLocations;
    }

    public getDataFlow(): DataFlowElement[] {
        return this.dataFlow;
    }

    // ====================
    public openPrimaryCodeRegion() {
        apiOpenCodeRegion(this.sarifFile, this.getResultPrimaryLocation());
    }

    public openCodeRegion(location: ResultLocation) {
        apiOpenCodeRegion(this.sarifFile, location);
    }

    public openRelatedLocation(index: number) {
        const relatedLocation = this.relatedLocations.get(index);
        if (relatedLocation) {
            apiOpenCodeRegion(this.sarifFile, relatedLocation.location);
        } else {
            console.warn(
                "[SARIF Explorer] Could not find related location with index " +
                    index +
                    ". The message in the SARIF file is likely incorrect.",
            );
        }
    }

    public exportAsGHIssue() {
        apiExportGitHubIssue([this]);
    }

    public copyPermalink() {
        apiCopyPermalink(this);
    }

    // ====================
    // This function converts a message into HTML, creating clickable links
    public messageToHTML(msg: string, shouldRemoveNewLines: boolean): HTMLElement[] {
        const res: HTMLElement[] = [];

        if (msg === undefined) {
            const span = document.createElement("span");
            span.innerText = "undefined";
            res.push(span);
            return res;
        }

        // Regexes to split by
        const httpsLinkRegex = /https:\/\/[^\s/$.?#].[^\s]*/i; // https://example.com

        const relatedLocationLinkRegex = /\[[^\]]+\]\(\d+\)/; // [text](index)
        const relatedLocationLinkRegexWithGroups = /\[([^\]]+)\]\((\d+)\)/;

        const mdLinkRegex = new RegExp("\\[[^\\]]+\\]\\(" + httpsLinkRegex.source + "\\)"); // [text](https://example.com)
        const mdLinkRegexWithGroups = new RegExp("\\[([^\\]]+)\\]\\((" + httpsLinkRegex.source + ")\\)");

        const combinedRegex = new RegExp(
            "(" + relatedLocationLinkRegex.source + "|" + mdLinkRegex.source + "|" + httpsLinkRegex.source + ")",
            "gmi",
        );

        let messageParts: string[];
        if (shouldRemoveNewLines) {
            const messageNoNewLines = msg.replace(/[\n]/gm, " ");
            messageParts = messageNoNewLines.split(combinedRegex);
        } else {
            messageParts = msg.split(combinedRegex);
        }

        for (let i = 0; i < messageParts.length; i++) {
            const part = messageParts[i];

            let linkText = "";
            let linkUrl = "";
            let linkOnClick: ((e: MouseEvent) => void) | undefined = undefined;
            let justText = "";
            let linkMatch;

            if ((linkMatch = part.match(relatedLocationLinkRegexWithGroups))) {
                linkText = linkMatch[1];
                linkUrl = "#";
                // This index is used to link to a file location defined elsewhere in the SARIF file
                const linkIndex = parseInt(linkMatch[2]);
                linkOnClick = (e) => {
                    e.stopImmediatePropagation();
                    this.openRelatedLocation(linkIndex);
                };
            } else if ((linkMatch = part.match(mdLinkRegexWithGroups))) {
                linkText = linkMatch[1];
                linkUrl = linkMatch[2];
            } else if ((linkMatch = part.match(httpsLinkRegex))) {
                const endPunctuationRegex = /[^\w\s/]+$/;
                const endPunctuationMatch = linkMatch[0].match(endPunctuationRegex);
                if (endPunctuationMatch) {
                    justText = endPunctuationMatch[0];
                }
                linkText = linkMatch[0].replace(endPunctuationRegex, "");
                linkUrl = linkText;
            } else {
                justText = part;
            }

            // If we defined a link above, create a link element. Otherwise, create a span element
            if (linkText) {
                // Link
                const link = document.createElement("a");
                link.href = linkUrl;
                link.innerText = linkText;
                if (linkOnClick) {
                    link.onclick = linkOnClick;
                }

                res.push(link);
            }

            // Not a link
            if (justText) {
                const span = document.createElement("span");
                span.innerText = justText;

                res.push(span);
            }
        }

        return res;
    }
}
