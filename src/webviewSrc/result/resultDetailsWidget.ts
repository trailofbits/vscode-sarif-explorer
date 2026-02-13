import { ResultAndRow } from "./result";
import { ResultsTableWidget } from "./resultsTableWidget";
import { getElementByIdOrThrow } from "../utils";
import { ResultLocation } from "../../shared/resultTypes";

export class ResultDetailsWidget {
    /* eslint-disable @typescript-eslint/naming-convention */
    private RESULT_DETAILS_SUMMARY_DIV = "resultDetailsSummary";
    private RESULT_DETAILS_TABLE_BODY = "resultDetailsTableBody";
    private RESULT_DETAILS_BUTTONS = "resultDetailsButtons";
    /* eslint-enable @typescript-eslint/naming-convention */

    private resultsTableWidget: ResultsTableWidget;

    private detailsSummary: HTMLDivElement;
    private tableBody: HTMLTableElement;
    private buttons: HTMLDivElement;

    constructor(resultsTableWidget: ResultsTableWidget) {
        this.resultsTableWidget = resultsTableWidget;

        this.detailsSummary = getElementByIdOrThrow(this.RESULT_DETAILS_SUMMARY_DIV) as HTMLTableElement;
        this.tableBody = getElementByIdOrThrow(this.RESULT_DETAILS_TABLE_BODY) as HTMLTableElement;
        this.buttons = getElementByIdOrThrow(this.RESULT_DETAILS_BUTTONS) as HTMLDivElement;
    }

    // ====================
    // Public functions
    // ====================
    public getButtons(): HTMLDivElement {
        return this.buttons;
    }

    public clearDetails() {
        this.detailsSummary.innerText = "No result selected";
        this.tableBody.innerText = "";
        this.buttons.innerText = "";
        this.buttons.classList.add("hidden");
    }

    public updateDetails(resultAndRow: ResultAndRow) {
        const result = resultAndRow.result;

        // Summary
        this.detailsSummary.innerText = "";

        // Buttons
        this.buttons.innerText = "";
        const buttonsElement = this.resultsTableWidget.createResultButtons(resultAndRow);
        this.buttons.appendChild(buttonsElement);
        this.buttons.classList.remove("hidden");

        // Table
        this.tableBody.innerText = "";

        const appendRowToTable = (key: string, value: string | HTMLElement): [HTMLTableCellElement, HTMLTableCellElement] => {
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

            return [cellKey, cellValue];
        };

        const appendNavigationTableToTable = (key: string, rowsData: { column1Text: string; column2Text: string; location: ResultLocation }[]) => {
            // Check if any rowsData has a column1Text
            const hasColumn1Text = rowsData.some((rowData) => rowData.column1Text !== "");

            // Create table with the same style as the main result's table
            const table = document.createElement("table");
            table.classList.add("mainTable");

            // Removes borders between cells
            table.setAttribute("rules", "none");

            // This makes the table focusable and makes the keydown event works
            table.tabIndex = 0;

            const tableBody = table.createTBody();

            for (let i = 0; i < rowsData.length; i++) {
                const rowData = rowsData[i];

                // Create the row
                const row = tableBody.insertRow();
                row.classList.add("detailTableRow");

                if (hasColumn1Text) {
                    // Create the text node
                    const textCell = row.insertCell();
                    textCell.classList.add("detailTableKey");

                    const textNode = document.createTextNode(rowData.column1Text);
                    textCell.appendChild(textNode);
                }

                // Create link to the code region
                const linkCell = row.insertCell();
                const link = document.createElement("a");
                link.href = "#";
                link.innerText = rowData.column2Text;
                linkCell.appendChild(link);

                // Append the text node and link to the cell
                row.onclick = () => {
                    result.openCodeRegion(rowData.location);
                };

                // Set the onclick event for each row so that clicking ArrowDown and ArrowUp will work
                row.tabIndex = 0;
                row.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "ArrowDown") {
                        if (i < rowsData.length - 1) {
                            const target = table.rows[i + 1];
                            target.focus();
                            target.click();
                        }
                    } else if (e.key === "ArrowUp") {
                        if (i > 0) {
                            const target = table.rows[i - 1];
                            target.focus();
                            target.click();
                        }
                    }
                });
            }

            const div = document.createElement("div");
            div.appendChild(table);
            const [_, cellValue] = appendRowToTable(key, div);
            cellValue.style.paddingTop = "0";
        };

        // Editable comment
        {
            const editableNodeTextArea = document.createElement("textarea");
            editableNodeTextArea.placeholder = "Add a comment...";
            editableNodeTextArea.value = result.getComment();
            editableNodeTextArea.oninput = () => {
                result.setComment(editableNodeTextArea.value);
                this.resultsTableWidget.updateResultRowComment(resultAndRow);
            };
            editableNodeTextArea.classList.add("detailEditableTextArea");
            editableNodeTextArea.classList.add("inputArea");

            appendRowToTable("Comment:", editableNodeTextArea);
        }

        // Rule
        {
            const rule = result.getRule();
            const ruleDiv = document.createElement("div");
            ruleDiv.classList.add("detailValueContainer");

            const span0 = this.resultsTableWidget.createResultLevelIcon(result.getLevel());

            const div0 = document.createElement("div");
            const span1 = document.createElement("span");
            span1.innerText = rule.name;

            const span2 = document.createElement("span");
            span2.classList.add("secondaryText");
            span2.innerText = " (" + rule.toolName + ")";

            div0.appendChild(span1);
            div0.appendChild(span2);

            ruleDiv.appendChild(span0);
            ruleDiv.appendChild(div0);
            appendRowToTable("Rule:", ruleDiv);
        }

        // Rule description
        const rule = result.getRule();
        const ruleDescription = rule.fullDescription || rule.shortDescription || "";
        {
            if (ruleDescription && ruleDescription !== result.getMessage()) {
                const ruleDescriptionDiv = document.createElement("div");
                for (const el of result.messageToHTML(ruleDescription, false)) {
                    ruleDescriptionDiv.appendChild(el);
                }
                appendRowToTable("Description:", ruleDescriptionDiv);
            }
        }

        // Result message
        {
            const messageDiv = document.createElement("div");
            for (const el of result.messageToHTML(result.getMessage(), false)) {
                messageDiv.appendChild(el);
            }
            appendRowToTable("Message:", messageDiv);
        }

        // Path
        {
            const pathElement = document.createElement("a");
            pathElement.classList.add("wordBreakAll");
            pathElement.href = result.getResultNormalizedPath();
            pathElement.innerText = result.getResultNormalizedPath() + ":" + result.getLine().toString();
            pathElement.onclick = () => {
                result.openPrimaryCodeRegion();
            };
            appendRowToTable("Path:", pathElement);
        }

        // Data Flow
        {
            const dataFlow = result.getDataFlow();
            if (dataFlow.length > 0) {
                appendNavigationTableToTable(
                    "Data Flow:",
                    dataFlow.map((dataFlowElement, i) => {
                        return {
                            column1Text: i === 0 ? "Source: " : i === result.getDataFlow().length - 1 ? "Sink: " : `${i}: `,
                            column2Text: dataFlowElement.message,
                            location: dataFlowElement.location,
                        };
                    }),
                );
            }
        }

        // Rule help
        {
            let ruleHelp = rule.help;

            if (ruleHelp === ruleDescription || ruleHelp === result.getMessage()) {
                ruleHelp = "";
            }

            if (ruleHelp === "") {
                ruleHelp = rule.helpURI;
            } else if (rule.helpURI !== "") {
                ruleHelp += " (";
                ruleHelp += rule.helpURI;
                ruleHelp += ")";
            }

            if (ruleHelp !== "") {
                const ruleHelpDiv = document.createElement("div");
                for (const el of result.messageToHTML(ruleHelp, false)) {
                    ruleHelpDiv.appendChild(el);
                }
                appendRowToTable("Help:", ruleHelpDiv);
            }
        }

        // Related Locations
        {
            const relatedLocations = result.getRelatedLocations();
            if (relatedLocations.size > 0) {
                const relatedLocationsRows = [];
                for (const [_key, value] of relatedLocations.entries()) {
                    relatedLocationsRows.push({
                        column1Text: "", // Empty so that the first column is suppressed
                        column2Text: value.label ? value.label : value.location.path + ":" + value.location.region.startLine.toString(),
                        location: value.location,
                    });
                }
                appendNavigationTableToTable("Related Locations:", relatedLocationsRows);
            }
        }
    }
}
