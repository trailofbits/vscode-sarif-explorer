import { getElementByIdOrThrow } from "../utils";
import { SarifFileAndRow, SarifFileListWidget } from "./sarifFileListWidget";

export class SarifFileDetailsWidget {
    /* eslint-disable @typescript-eslint/naming-convention */
    private SARIF_FILE_DETAILS_DIV = "sarifFileDetailsSummary";
    private SARIF_FILE_DETAILS_TABLE_ID = "sarifFileDetailsTableBody";
    private SARIF_FILE_DETAILS_BUTTONS = "sarifFileDetailsButtons";
    /* eslint-enable @typescript-eslint/naming-convention */

    private sarifFileWidget: SarifFileListWidget;

    private detailsSummary: HTMLDivElement;
    private tableBody: HTMLTableElement;
    private buttons: HTMLDivElement;

    private currentSarifFileAndRow: SarifFileAndRow | null = null;

    constructor(sarifFileWidget: SarifFileListWidget) {
        this.sarifFileWidget = sarifFileWidget;

        this.detailsSummary = getElementByIdOrThrow(this.SARIF_FILE_DETAILS_DIV) as HTMLDivElement;
        this.tableBody = getElementByIdOrThrow(this.SARIF_FILE_DETAILS_TABLE_ID) as HTMLTableElement;
        this.buttons = getElementByIdOrThrow(this.SARIF_FILE_DETAILS_BUTTONS) as HTMLDivElement;
    }

    public clearDetails() {
        this.detailsSummary.innerText = "No SARIF file selected";
        this.tableBody.innerText = "";
        this.buttons.innerText = "";
        this.buttons.classList.add("hidden");
    }

    public updateDetails(sarifFileAndRow: SarifFileAndRow) {
        this.currentSarifFileAndRow = sarifFileAndRow;
        const sarifFile = sarifFileAndRow.sarifFile;

        // Clear the summary
        this.detailsSummary.innerText = "";

        // Buttons
        this.buttons.innerText = "";
        const buttonsElement = this.sarifFileWidget.createSarifFileButtons(sarifFileAndRow);
        this.buttons.appendChild(buttonsElement);
        this.buttons.classList.remove("hidden");

        // Add data of the result object to the details panel
        this.tableBody.innerText = "";

        const appendRowToTable = (key: string, value: string | HTMLElement) => {
            const row = this.tableBody.insertRow();
            const cellKey = row.insertCell();
            const cellValue = row.insertCell();
            cellKey.innerText = key;
            if (typeof value === "string") {
                cellValue.innerText = value;
            } else {
                cellValue.appendChild(value);
            }

            cellKey.classList.add("detailKey");
            cellValue.classList.add("detailValue");
        };

        // Editable base folder
        {
            const editableBaseFolderNode = document.createElement("textarea");
            editableBaseFolderNode.placeholder =
                "Add a base folder... (this is the folder from which your results' relative paths will be based one)";
            editableBaseFolderNode.value = sarifFile.getResultsBaseFolder();
            editableBaseFolderNode.oninput = () => {
                sarifFile.setResultsBaseFolder(editableBaseFolderNode.value);
            };
            editableBaseFolderNode.classList.add("detailEditableTextArea");
            editableBaseFolderNode.classList.add("inputArea");
            editableBaseFolderNode.rows = 1;

            appendRowToTable("BaseFolder:", editableBaseFolderNode);
        }

        // Path node
        {
            const pathNode = document.createElement("span");
            pathNode.innerText = sarifFile.getSarifFilePath();
            pathNode.classList.add("wordBreakAll");
            appendRowToTable("Path:", pathNode);
        }

        // Only display #Runs if there are more than 1
        if (sarifFile.getRunCount() > 1) {
            // #Runs node
            {
                appendRowToTable("#Runs:", sarifFile.getRunCount().toString());
            }
        }

        for (let i = 0; i < sarifFile.getRunCount(); i++) {
            if (sarifFile.getRunCount() > 1) {
                // Separator
                const row = this.tableBody.insertRow();
                row.style.borderBottom = "1px solid";
            }
            // Tool with link to tool.informationUri (if it exists)
            const tool = sarifFile.getRunTool(i);
            {
                let toolElement: string | HTMLAnchorElement = tool.name;
                if (tool.informationUri !== "") {
                    toolElement = document.createElement("a");
                    toolElement.classList.add("wordBreakAll");
                    toolElement.href = tool.informationUri;
                    toolElement.innerText = tool.name;
                }
                appendRowToTable("Tool:", toolElement);
            }

            // Number of results
            {
                appendRowToTable("#Results:", sarifFile.getRunResults(i).length.toString());
            }

            // Rules
            {
                const ruleIdsOrdered = Array.from(tool.rules.keys()).sort();

                for (let i = 0; i < ruleIdsOrdered.length; i++) {
                    const ruleId = ruleIdsOrdered[i];
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const rule = tool.rules.get(ruleId)!;
                    const ruleElement = document.createElement("li");
                    ruleElement.classList.add("wordBreakAll");
                    ruleElement.innerText = rule.name;

                    if (i === 0) {
                        appendRowToTable("Rules[]:", ruleElement);
                    } else {
                        appendRowToTable("", ruleElement);
                    }
                }
            }
        }
    }

    public updateBaseFolder(sarifFilePath: string, baseFolder: string) {
        if (this.currentSarifFileAndRow === null) {
            return;
        }

        if (this.currentSarifFileAndRow.sarifFile.getSarifFilePath() !== sarifFilePath) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const editableBaseFolderNode = this.tableBody.querySelector("textarea")!;
        editableBaseFolderNode.value = baseFolder;
    }
}
