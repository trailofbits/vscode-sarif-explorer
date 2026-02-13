import { existsSync, readFileSync, writeFileSync } from "fs";
import { ResultNote, ResultNotes } from "../../shared/resultTypes";

export type SarifFileWorkspaceData = {
    baseFolder: string;
};

export class SarifFileMetadata {
    private sarifFilePath: string;
    private notesFilePath: string;
    private resultIdToNotes: Map<string, ResultNote> = new Map();
    private hiddenRules: Set<string> = new Set();
    private workspaceMetadata: SarifFileWorkspaceData;

    constructor(sarifFilePath: string, sarifFileWorkspaceData: SarifFileWorkspaceData) {
        this.sarifFilePath = sarifFilePath;
        this.notesFilePath = this.sarifFilePath + ".sarifexplorer";
        this.workspaceMetadata = sarifFileWorkspaceData;

        this.loadFromFile();
    }

    public getSarifFilePath(): string {
        return this.sarifFilePath;
    }

    public getResultNotes(): ResultNotes {
        const resultNotes: ResultNotes = {};
        for (const [resultId, note] of this.resultIdToNotes) {
            resultNotes[resultId] = note;
        }
        return resultNotes;
    }

    public getHiddenRules(): string[] {
        return Array.from(this.hiddenRules);
    }

    public getWorkspaceMetadata(): SarifFileWorkspaceData {
        return this.workspaceMetadata;
    }

    public getBaseFolder(): string {
        return this.workspaceMetadata.baseFolder;
    }

    public setResultNote(resultId: string, note: ResultNote) {
        this.resultIdToNotes.set(resultId, note);

        void this.writeFile();
    }

    public setHiddenRule(ruleId: string, isHidden: boolean) {
        if (isHidden) {
            this.hiddenRules.add(ruleId);
        } else {
            this.hiddenRules.delete(ruleId);
        }

        void this.writeFile();
    }

    public setBaseFolder(baseFolder: string) {
        this.workspaceMetadata.baseFolder = baseFolder;
    }

    public loadFromFile() {
        if (!existsSync(this.notesFilePath)) {
            return;
        }

        let res = JSON.parse(readFileSync(this.notesFilePath, "utf8"));
        if (typeof res === "string") {
            // We have to call JSON.parse again to ensure that 'res' is an object and not a string :thanks_js:
            // https://stackoverflow.com/questions/42494823/json-parse-returns-string-instead-of-object
            res = JSON.parse(res);
        }

        if (res.resultIdToNotes) {
            this.resultIdToNotes = new Map(Object.entries(res.resultIdToNotes));
        }

        if (res.hiddenRules) {
            this.hiddenRules = new Set(res.hiddenRules);
        }
    }

    private writeFile() {
        const objAsStr = JSON.stringify(
            {
                resultIdToNotes: this.getResultNotes(),
                hiddenRules: this.getHiddenRules(),
            },
            null,
            2,
        );

        writeFileSync(this.notesFilePath, objAsStr);
    }
}
