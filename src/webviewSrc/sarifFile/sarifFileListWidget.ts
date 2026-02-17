import { SarifFile } from "./sarifFile";
import { SarifFileList } from "./sarifFileList";
import { ResultsTableWidget } from "../result/resultsTableWidget";
import { SarifFileDetailsWidget } from "./sarifFileDetailsWidget";
import { getPathLeaf } from "../../shared/file";
import { apiCloseSarifFile, apiLaunchOpenSarifFileDialog, apiOpenSarifFile } from "../extensionApi";
import { setToStringInParts, splitStringInParts } from "../result/resultFilters";
import { getElementByIdOrThrow, scrollToRow } from "../utils";

export type SarifFileAndRow = {
    sarifFile: SarifFile;
    row: HTMLElement;
};

class SelectedSarifFile {
    /* eslint-disable @typescript-eslint/naming-convention */
    private SELECTED_ROW_CLASS = "selectedRow";
    /* eslint-enable @typescript-eslint/naming-convention */

    private sarifFileDetailsWidget: SarifFileDetailsWidget;

    // The currently selected result and HTML row
    private sarifFileAndRow: SarifFileAndRow | null = null;

    constructor(sarifFileDetailsWidget: SarifFileDetailsWidget) {
        this.sarifFileDetailsWidget = sarifFileDetailsWidget;

        // Clear the details panel
        this.sarifFileDetailsWidget.clearDetails();
    }

    public getSarifFileAndRow(): SarifFileAndRow | null {
        if (this.sarifFileAndRow) {
            return this.sarifFileAndRow;
        }
        return null;
    }

    public getSarifFile(): SarifFile | null {
        if (this.sarifFileAndRow) {
            return this.sarifFileAndRow.sarifFile;
        }
        return null;
    }

    public getRow(): HTMLElement | null {
        if (this.sarifFileAndRow) {
            return this.sarifFileAndRow.row;
        }
        return null;
    }

    public clearSelection(): void {
        if (this.sarifFileAndRow === null) {
            return;
        }

        // Remove the selectedRow class from the previously selected row
        this.sarifFileAndRow.row.classList.remove(this.SELECTED_ROW_CLASS);

        this.sarifFileAndRow = null;

        // Clear the details panel
        this.sarifFileDetailsWidget.clearDetails();
    }

    public setSarifFile(sarifFileAndRow: SarifFileAndRow): void {
        if (this.sarifFileAndRow !== null) {
            // Remove the selectedRow class from the previously selected row
            this.sarifFileAndRow.row.classList.remove(this.SELECTED_ROW_CLASS);
        }

        // Set the active class on the new row
        this.sarifFileAndRow = sarifFileAndRow;
        this.sarifFileAndRow.row.classList.add(this.SELECTED_ROW_CLASS);

        // Update the details widget accordingly
        this.sarifFileDetailsWidget.updateDetails(this.sarifFileAndRow);
    }
}

export class SarifFileListWidget {
    /* eslint-disable @typescript-eslint/naming-convention */
    private SARIF_LIST_TABLE_ID = "sarifFileTable";
    private SARIF_LIST_OPEN_BUTTON_ID = "openNewSarifFileButton";
    private CLOSE_ALL_SARIF_FILES_BUTTON_ID = "closeAllSarifFilesButton";
    /* eslint-enable @typescript-eslint/naming-convention */

    private sarifFileListData: SarifFileList;

    private selectedSarifFile: SelectedSarifFile;

    private sarifFileTableElement: HTMLTableElement;

    private resultTableWidget: ResultsTableWidget;
    private sarifFileDetailsWidget: SarifFileDetailsWidget;

    private sarifFilePathToRow: Map<string, SarifFileAndRow>;

    constructor(resultTableWidget: ResultsTableWidget) {
        this.resultTableWidget = resultTableWidget;
        this.sarifFileListData = new SarifFileList();
        this.sarifFileDetailsWidget = new SarifFileDetailsWidget(this);
        this.selectedSarifFile = new SelectedSarifFile(this.sarifFileDetailsWidget);
        this.sarifFilePathToRow = new Map<string, SarifFileAndRow>();

        // Get the 'sarifFileList' element from the DOM and store in the class
        this.sarifFileTableElement = getElementByIdOrThrow(this.SARIF_LIST_TABLE_ID) as HTMLTableElement;

        // Add a click handler to the open SARIF file button
        const openNewSarifFileButton = getElementByIdOrThrow(this.SARIF_LIST_OPEN_BUTTON_ID) as HTMLButtonElement;
        openNewSarifFileButton.onclick = (): void => {
            apiLaunchOpenSarifFileDialog();
        };

        // Close all SARIF files button
        const closeAllSarifFilesButton = getElementByIdOrThrow(this.CLOSE_ALL_SARIF_FILES_BUTTON_ID) as HTMLButtonElement;
        closeAllSarifFilesButton.onclick = (): void => {
            this.sarifFilePathToRow.forEach((sarifFileAndRow): void => {
                this.removeSarifFile(sarifFileAndRow);
                apiCloseSarifFile(sarifFileAndRow.sarifFile.getSarifFilePath());
            });
        };

        this.sarifFileTableElement.setAttribute("tabindex", "0");

        this.sarifFileTableElement.addEventListener("keydown", (e: KeyboardEvent): void => {
            const selectedRow = this.selectedSarifFile.getRow();

            switch (e.code) {
                case "ArrowDown":
                    if (selectedRow) {
                        this.setSelectedResultBelow(selectedRow);
                    }
                    e.preventDefault();
                    break;
                case "ArrowUp":
                    if (selectedRow) {
                        this.setSelectedResultAbove(selectedRow);
                    }
                    e.preventDefault();
                    break;
            }
        });
    }

    // ====================
    // Public functions
    // ====================
    public getSarifFileDetailsWidget(): SarifFileDetailsWidget {
        return this.sarifFileDetailsWidget;
    }

    public addSarifFile(sarifFile: SarifFile): void {
        this.sarifFileListData.addSarifFile(sarifFile);
        this.resultTableWidget.addResults(sarifFile);

        // Add the row to the table
        const row = this.sarifFileTableElement.insertRow();
        row.title = sarifFile.getSarifFilePath();

        // Add a fake cell to make style consistent with the results table. This makes sure the padding is the same
        const cell1 = row.insertCell();
        cell1.classList.add("fakeCell");
        cell1.innerText = "A";

        // Add the path that, if clicked, will show the details in the details panel
        const cell2 = row.insertCell();
        cell2.classList.add("cellWithButtons");

        const pathContent = document.createElement("div");
        pathContent.classList.add("cellWithButtonsContent");
        pathContent.textContent = getPathLeaf(sarifFile.getSarifFilePath()) + " ";

        // Create the secondaryText with the full path
        const fullPathSpan = document.createElement("span");
        fullPathSpan.classList.add("secondaryText");
        fullPathSpan.textContent = sarifFile.getSarifFilePath();
        pathContent.appendChild(fullPathSpan);

        row.onclick = (): void => {
            if (!this.sarifFileListData.hasSarifFile(sarifFile.getSarifFilePath())) {
                return;
            }

            this.selectedSarifFile.setSarifFile({
                row: row,
                sarifFile: sarifFile,
            });
        };

        const sarifFileRow: SarifFileAndRow = { sarifFile, row };
        const rowButtons = this.createSarifFileButtons(sarifFileRow);
        this.sarifFilePathToRow.set(sarifFile.getSarifFilePath(), sarifFileRow);
        cell2.appendChild(pathContent);
        cell2.appendChild(rowButtons);
    }

    public createSarifFileButtons(sarifFileAndRow: SarifFileAndRow): HTMLDivElement {
        const sarifFile = sarifFileAndRow.sarifFile;
        const row = sarifFileAndRow.row;

        const rowButtons = document.createElement("div");
        rowButtons.classList.add("rowButtons");

        // Close button
        const closeButton = document.createElement("div");
        closeButton.classList.add("rowButton");
        closeButton.classList.add("codicon");
        closeButton.classList.add("codicon-close");
        closeButton.onclick = (e): void => {
            e.stopPropagation();
            this.removeSarifFile(sarifFileAndRow);
            apiCloseSarifFile(sarifFileAndRow.sarifFile.getSarifFilePath());
        };
        closeButton.title = "Close this SARIF file";

        // Hide button
        const hideButton = document.createElement("div");
        hideButton.classList.add("rowButton");
        hideButton.classList.add("codicon");
        // If the result is filtered out, show the "eye closed" icon
        if (this.isSarifFileFiltered(sarifFile.getSarifFilePath())) {
            hideButton.classList.add("codicon-eye-closed");
            row.classList.add(this.resultTableWidget.RULE_ROW_FILTERED_OUT_CLASS);
        } else {
            hideButton.classList.add("codicon-eye");
        }
        hideButton.onclick = (e): void => {
            e.stopPropagation();

            // Add this ruleID to the FILTER_RULE_ID filter
            const filterSarifFilesElement = getElementByIdOrThrow(this.resultTableWidget.FILTER_SARIF_FILES_ID) as HTMLTextAreaElement;
            const excludedSarifFiles = splitStringInParts(filterSarifFilesElement.value);
            if (excludedSarifFiles.has(sarifFile.getSarifFilePath())) {
                excludedSarifFiles.delete(sarifFile.getSarifFilePath());
                // Update the "hide" button with the correct icon
                hideButton.classList.remove("codicon-eye-closed");
                hideButton.classList.add("codicon-eye");
                row.classList.remove(this.resultTableWidget.RULE_ROW_FILTERED_OUT_CLASS);
            } else {
                excludedSarifFiles.add(sarifFile.getSarifFilePath());
                // Update the "hide" button with the correct icon
                hideButton.classList.remove("codicon-eye");
                hideButton.classList.add("codicon-eye-closed");
                row.classList.add(this.resultTableWidget.RULE_ROW_FILTERED_OUT_CLASS);
            }

            filterSarifFilesElement.value = setToStringInParts(excludedSarifFiles);
            filterSarifFilesElement.dispatchEvent(new Event("input"));
        };
        hideButton.title = "Hide/Show this SARIF file's results from the results table";

        // Refresh button
        const refreshButton = document.createElement("div");
        refreshButton.classList.add("rowButton");
        refreshButton.classList.add("codicon");
        refreshButton.classList.add("codicon-refresh");
        refreshButton.onclick = (e): void => {
            e.stopPropagation();

            // Remove and reopen the SARIF file
            const sarifFilePath = sarifFile.getSarifFilePath();
            this.removeSarifFile(sarifFileAndRow);
            apiOpenSarifFile(sarifFilePath);
        };
        refreshButton.title = "Reload results for this SARIF file";

        rowButtons.appendChild(refreshButton);
        rowButtons.appendChild(hideButton);
        rowButtons.appendChild(closeButton);

        return rowButtons;
    }

    public removeSarifFile(sarifFileAndRow: SarifFileAndRow): void {
        const sarifFile = sarifFileAndRow.sarifFile;

        // If the selected row is the one we're removing, clear the selection
        const selectSarifFileOrNull = this.selectedSarifFile.getSarifFile();
        if (selectSarifFileOrNull && selectSarifFileOrNull.getSarifFilePath() === sarifFile.getSarifFilePath()) {
            this.selectedSarifFile.clearSelection();
        }

        // Remove the row from the table
        sarifFileAndRow.row.remove();

        // Remove the SARIF file from the list and results table
        this.sarifFileListData.removeSarifFile(sarifFile.getSarifFilePath());
        this.resultTableWidget.removeResults(sarifFile);
        // Remove the SARIF file path from the map
        this.sarifFilePathToRow.delete(sarifFile.getSarifFilePath());
    }

    public removeSarifFileWithPath(sarifFilePath: string): void {
        const row = this.sarifFilePathToRow.get(sarifFilePath);
        if (!row) {
            return;
        }
        this.removeSarifFile(row);
    }

    public hasSarifFile(sarifFilePath: string): boolean {
        return this.sarifFileListData.hasSarifFile(sarifFilePath);
    }

    public getSarifFileListData(): SarifFileList {
        return this.sarifFileListData;
    }

    // ====================
    private isSarifFileFiltered(sarifFilePath: string): boolean {
        return this.resultTableWidget.resultsTable.isSarifFileFiltered(sarifFilePath);
    }

    // ====================
    // For keyboard shortcuts
    private setSelectedResultBelow(selectedRow: HTMLElement): void {
        const nextRow = selectedRow.nextElementSibling as HTMLElement;
        if (!nextRow) {
            return;
        }

        scrollToRow(nextRow);
        nextRow.click();
    }

    private setSelectedResultAbove(selectedRow: HTMLElement): void {
        const prevRow = selectedRow.previousElementSibling as HTMLElement;
        if (!prevRow) {
            return;
        }

        scrollToRow(prevRow);
        prevRow.click();
    }
}
