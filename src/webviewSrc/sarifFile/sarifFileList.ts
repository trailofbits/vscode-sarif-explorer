import { SarifFile } from "./sarifFile";

export class SarifFileList {
    // Map of open SARIF files (key is the path, value is a SarifFile object)
    private openSarifFiles: Map<string, SarifFile> = new Map<string, SarifFile>();

    // Returns true if the List contains the SARIF file
    public hasSarifFile(path: string) {
        return this.openSarifFiles.has(path);
    }

    // Returns true if the List contains the SARIF file
    public getSarifFile(path: string) {
        return this.openSarifFiles.get(path);
    }

    // Add SARIF file to the list of open SARIF files
    public addSarifFile(sarifFile: SarifFile) {
        const path = sarifFile.getSarifFilePath();
        this.openSarifFiles.set(path, sarifFile);
    }

    // Remove SARIF file from the list of open SARIF files
    public removeSarifFile(path: string) {
        this.openSarifFiles.delete(path);
    }
}
