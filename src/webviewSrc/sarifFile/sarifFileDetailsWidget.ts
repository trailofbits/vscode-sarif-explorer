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

    public clearDetails(): void {
        this.detailsSummary.innerText = "No SARIF file selected";
        this.tableBody.innerText = "";
        this.buttons.innerText = "";
        this.buttons.classList.add("hidden");
    }

    public updateDetails(sarifFileAndRow: SarifFileAndRow): void {
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

        const appendRowToTable = (key: string, value: string | HTMLElement): void => {
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

        const appendMultiRowsToTable = (key: string, values: (string | HTMLElement)[]): void => {
            for (let i = 0; i < values.length; i++) {
                appendRowToTable(i === 0 ? key : "", values[i]);
            }
        };

        const serializeUnknownValue = (value: unknown): string => {
            if (value === undefined || value === null) {
                return "";
            }
            if (typeof value === "string") {
                return value;
            }
            try {
                const serialized = JSON.stringify(value);
                return serialized === undefined ? "" : serialized;
            } catch {
                return "[unserializable]";
            }
        };

        // Editable base folder
        {
            const editableBaseFolderNode = document.createElement("textarea");
            editableBaseFolderNode.placeholder = "Add a base folder... (this is the folder from which your results' relative paths will be based one)";
            editableBaseFolderNode.value = sarifFile.getResultsBaseFolder();
            editableBaseFolderNode.oninput = (): void => {
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
                const toolName = tool.version !== "" ? `${tool.name} (${tool.version})` : tool.name;
                let toolElement: string | HTMLAnchorElement = toolName;
                if (tool.informationUri !== "") {
                    toolElement = document.createElement("a");
                    toolElement.classList.add("wordBreakAll");
                    toolElement.href = tool.informationUri;
                    toolElement.innerText = toolName;
                }
                appendRowToTable("Tool Driver:", toolElement);
            }

            // Number of results
            {
                appendRowToTable("#Results:", sarifFile.getRunResults(i).length.toString());
            }

            // Run automation ID
            {
                const automationDetailsId = sarifFile.getRunAutomationDetailsId(i);
                if (automationDetailsId !== "") {
                    appendRowToTable("Automation ID:", automationDetailsId);
                }
            }

            // Run version control provenance
            {
                const versionControlProvenanceRows: string[] = [];
                for (const versionControlProvenance of sarifFile.getRunVersionControlProvenance(i)) {
                    const repositoryUri = versionControlProvenance.repositoryUri;
                    const revisionId = versionControlProvenance.revisionId;

                    if (repositoryUri !== "" && revisionId !== "") {
                        versionControlProvenanceRows.push(repositoryUri + " @ " + revisionId);
                    } else if (repositoryUri !== "") {
                        versionControlProvenanceRows.push(repositoryUri);
                    } else if (revisionId !== "") {
                        versionControlProvenanceRows.push(revisionId);
                    }
                }

                if (versionControlProvenanceRows.length > 0) {
                    appendMultiRowsToTable("Version Control Provenance:", versionControlProvenanceRows);
                }
            }

            // Tool extensions
            {
                const extensionRows: string[] = [];
                for (const extension of tool.extensions) {
                    const extensionName = extension.version !== "" ? `${extension.name} (${extension.version})` : extension.name;
                    const extensionProperties = serializeUnknownValue(extension.properties);
                    if (extensionProperties !== "") {
                        extensionRows.push(extensionName + " - " + extensionProperties);
                    } else {
                        extensionRows.push(extensionName);
                    }
                }

                if (extensionRows.length > 0) {
                    appendMultiRowsToTable("Tool Extensions:", extensionRows);
                }
            }

            // Rules
            {
                const ruleIdsOrdered = Array.from(tool.rules.keys()).sort();

                for (let i = 0; i < ruleIdsOrdered.length; i++) {
                    const ruleId = ruleIdsOrdered[i];

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

    public updateBaseFolder(sarifFilePath: string, baseFolder: string): void {
        if (this.currentSarifFileAndRow === null) {
            return;
        }

        if (this.currentSarifFileAndRow.sarifFile.getSarifFilePath() !== sarifFilePath) {
            return;
        }

        const editableBaseFolderNode = this.tableBody.querySelector("textarea")!;
        editableBaseFolderNode.value = baseFolder;
    }
}
