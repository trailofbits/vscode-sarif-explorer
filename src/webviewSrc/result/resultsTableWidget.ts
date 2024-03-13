import { getPathLeaf } from "../../shared/file";
import {
    ResultLevel,
    ResultLocation,
    ResultStatus,
    Rule,
    VSCodeConfig,
    defaultVSCodeConfig,
} from "../../shared/resultTypes";
import {
    apiExportGitHubIssue,
    apiLaunchOpenSarifFileDialog,
    apiSendBugsToWeAudit,
    apiSetHiddenRule,
} from "../extensionApi";
import { SarifFile } from "../sarifFile/sarifFile";
import { getElementByIdOrThrow, scrollToRow } from "../utils";
import { Result, ResultAndRow } from "./result";
import { ResultDetailsWidget } from "./resultDetailsWidget";
import { setToStringInParts, splitStringInParts } from "./resultFilters";
import { ResultsTable, SortDirection, TableHeaders } from "./resultsTable";

type RuleStatus = {
    rule: Rule;
    row: HTMLTableRowElement;
    // The string is sarifFilePath|resultId.
    // This is necessary to support multiple files with the same rule and result ids
    results: Map<string, ResultAndRow>;
    sarifFilePaths: string[];

    opened: boolean; // Whether a rule is opened (used to keep state when filtered but was opened)
    filteredOut: boolean; // All results are filtered out
};

class SelectedResult {
    /* eslint-disable @typescript-eslint/naming-convention */
    private SELECTED_ROW_CLASS = "selectedRow";
    /* eslint-enable @typescript-eslint/naming-convention */

    private resultDetailsWidget: ResultDetailsWidget;

    // The currently selected result and HTML row
    private resultAndRow: ResultAndRow | null = null;
    // Whether the currently selected result is filtered out or being displayed
    private isBeingDisplayed = false;

    constructor(resultDetailsWidget: ResultDetailsWidget) {
        this.resultDetailsWidget = resultDetailsWidget;
    }

    public getIsBeingDisplayed(): boolean {
        return this.isBeingDisplayed;
    }

    public getResultAndRow(): ResultAndRow | null {
        // The result can only be accessed if it is being displayed
        if (this.isBeingDisplayed && this.resultAndRow) {
            return this.resultAndRow;
        }
        return null;
    }

    public getResult(): Result | null {
        const resultAndRow = this.getResultAndRow();
        if (resultAndRow) {
            return resultAndRow.result;
        }
        return null;
    }

    public getRow(): HTMLTableRowElement | null {
        const resultAndRow = this.getResultAndRow();
        if (resultAndRow) {
            return resultAndRow.row;
        }
        return null;
    }

    public getResultEvenIfNotBeingDisplayed(): Result | null {
        if (this.resultAndRow) {
            return this.resultAndRow.result;
        }
        return null;
    }

    public clearSelection(): void {
        if (this.resultAndRow === null) {
            return;
        }

        // Remove the selectedRow class from the previously selected row
        this.resultAndRow.row.classList.remove(this.SELECTED_ROW_CLASS);

        this.resultAndRow = null;
        this.isBeingDisplayed = false;

        // Clear the details panel
        this.resultDetailsWidget.clearDetails();
    }

    public setResult(resultAndRow: ResultAndRow): void {
        if (this.resultAndRow !== null) {
            // Remove the selectedRow class from the previously selected row
            this.resultAndRow.row.classList.remove(this.SELECTED_ROW_CLASS);
        }

        // Set the active class on the new row
        this.resultAndRow = resultAndRow;
        this.resultAndRow.row.classList.add(this.SELECTED_ROW_CLASS);

        // A new result is always being displayed
        this.isBeingDisplayed = true;

        // Update the details widget accordingly
        this.resultDetailsWidget.updateDetails(this.resultAndRow);
    }

    public setIsBeingDisplayed(isBeingDisplayed: boolean): void {
        if (this.resultAndRow === null) {
            throw new Error("Cannot set isBeingDisplayed when no result is selected");
        }

        this.isBeingDisplayed = isBeingDisplayed;

        if (this.isBeingDisplayed === false) {
            this.resultDetailsWidget.clearDetails();
        } else {
            this.resultDetailsWidget.updateDetails(this.resultAndRow);
        }
    }
}

export class ResultsTableWidget {
    /* eslint-disable @typescript-eslint/naming-convention */
    private RESULTS_TAB_ID = "resultsTab";
    private SARIF_FILES_TAB_ID = "sarifFilesTab";
    private NO_FILES_OPENED_CONTAINER_ID = "noFilesOpenedContainer";

    private TABLE_ID = "resultsTable";
    private TABLE_HEADER_INDEX = "data-table-header-index";

    private NO_FILES_OPENED_BUTTON = "noFilesOpenedButton";

    private FILTER_MENU_ID = "filterMenu";
    private FILTER_MENU_BUTTON_ID = "filterMenuButton";
    private FILTER_REFRESH_BUTTON_ID = "refreshFilterMenuButton";
    private FILTER_KEYWORD_ID = "keywordFilter";
    private FILTER_INCLUDE_PATH_ID = "includePathsFilter";
    private FILTER_EXCLUDE_PATH_ID = "excludePathsFilter";
    private FILTER_RULE_ID_ID = "excludeRulesFilter";
    public FILTER_SARIF_FILES_ID = "excludeSarifFilesFilter";
    private FILTER_LEVEL_ERROR_ID = "filterLevelError";
    private FILTER_LEVEL_WARNING_ID = "filterLevelWarning";
    private FILTER_LEVEL_NOTE_ID = "filterLevelNote";
    private FILTER_LEVEL_NONE_ID = "filterLevelNone";
    private FILTER_STATUS_TODO_ID = "filterStatusTodo";
    private FILTER_STATUS_FALSE_POSITIVE_ID = "filterStatusFalsePositive";
    private FILTER_STATUS_BUG_ID = "filterStatusBug";

    private CLOSE_ALL_ROWS_BUTTON_ID = "closeAllRowsButton";
    private SEND_BUGS_TO_WEAUDIT_BUTTON_ID = "sendBugsToWeAuditButton";

    private RULE_ROW_CLASS = "ruleRow";
    private RULE_ROW_OPENED_CLASS = "codicon-chevron-down";
    private RULE_ROW_CLOSED_CLASS = "codicon-chevron-right";
    private RULE_ROW_FILTERED_SUMMARY_CLASS = "filteredResultsSummary";
    public RULE_ROW_FILTERED_OUT_CLASS = "filteredOutRow";

    private STATUS_ICON_ID = "resultStatus";
    private TODO_CODICON = "codicon-question";
    private TODO_ICON_CLASS = "todoStatusIcon";
    private FALSE_POSITIVE_CODICON = "codicon-check";
    private FALSE_POSITIVE_ICON_CLASS = "falsePositiveStatusIcon";
    private BUG_CODICON = "codicon-bug";
    private BUG_ICON_CLASS = "bugStatusIcon";

    private NOTE_STATUS_ICON_ID = "resultNoteStatus";
    private NOTE_ICON_CLASS = "noteStatusIcon";
    private NOTE_ICON = "codicon-comment";
    /* eslint-enable @typescript-eslint/naming-convention */

    private resultsTab: HTMLDivElement;
    private sarifFilesTab: HTMLDivElement;
    private noFilesOpenedContainer: HTMLDivElement;

    // The instance that manages storing, sorting, and filtering of results
    public resultsTable: ResultsTable;
    private amountOfSarifFilesLoaded = 0;

    // The widget bellow the table that displays details of the current result
    private detailsWidget: ResultDetailsWidget;

    private tableElement: HTMLTableElement;

    private ruleIdToRuleStatus: Map<string, RuleStatus> = new Map();

    private selectedResult: SelectedResult;

    private vscodeConfig: VSCodeConfig = defaultVSCodeConfig();

    constructor() {
        // Using this to keep the button consistent in both the table and the details widget
        this.detailsWidget = new ResultDetailsWidget(this);
        this.resultsTable = new ResultsTable();
        this.selectedResult = new SelectedResult(this.detailsWidget);

        this.resultsTab = getElementByIdOrThrow(this.RESULTS_TAB_ID) as HTMLDivElement;
        this.sarifFilesTab = getElementByIdOrThrow(this.SARIF_FILES_TAB_ID) as HTMLDivElement;
        this.noFilesOpenedContainer = getElementByIdOrThrow(this.NO_FILES_OPENED_CONTAINER_ID) as HTMLDivElement;
        this.tableElement = getElementByIdOrThrow(this.TABLE_ID) as HTMLTableElement;

        this.initNoFilesOpenedView();
        this.initResultsFilter();
        this.initResultsTable();
    }

    private initNoFilesOpenedView() {
        const noFilesOpenedButton = getElementByIdOrThrow(this.NO_FILES_OPENED_BUTTON) as HTMLButtonElement;
        noFilesOpenedButton.onclick = () => {
            apiLaunchOpenSarifFileDialog();
        };
    }

    private initResultsTable() {
        // For each header cell in the table, add an onclick event that handles sorting
        const tableHeaders = this.tableElement.getElementsByTagName("th");
        for (let i = 0; i < tableHeaders.length; i++) {
            const th = tableHeaders[i];

            // Hide the status icon of each header on init
            const statusIcon = th.getElementsByClassName("resultsTableStatusIcon")[0];
            statusIcon.classList.add("invisible");

            // Set the column index to help with sorting
            th.setAttribute(this.TABLE_HEADER_INDEX, i.toString());

            // These are fake headers that are not sortable, etc
            if (i === TableHeaders.FakeHeaderDropdownSymbol) {
                continue;
            }

            // Sanity check that the header is one of the expected ones
            if (i !== TableHeaders.StatusSymbol) {
                const expectedHeaderText = TableHeaders[i];
                const realHeaderText = th.getElementsByTagName("span")[0].innerText;
                if (expectedHeaderText !== realHeaderText) {
                    throw new Error(`Unexpected header text: ${realHeaderText}`);
                }
            }

            // Sort the table on click
            th.onclick = () => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const header = parseInt(th.getAttribute(this.TABLE_HEADER_INDEX)!) as TableHeaders;
                this.resultsTable.sortByHeader(header);
                this.render();
            };
        }

        // This makes the table focusable and makes the keydown event works
        this.tableElement.setAttribute("tabindex", "0");

        // Set the onclick event for the table
        this.tableElement.addEventListener("keydown", (e: KeyboardEvent) => {
            // Get a non-hidden row
            let selectedResultAndRow = this.selectedResult.getResultAndRow();
            if (selectedResultAndRow && selectedResultAndRow.row.classList.contains("hidden")) {
                selectedResultAndRow = null;
            }

            switch (e.code) {
                case "ArrowDown":
                    if (selectedResultAndRow) {
                        this.setSelectedResultBelow(selectedResultAndRow.row);
                    }
                    e.preventDefault();
                    break;
                case "ArrowUp":
                    if (selectedResultAndRow) {
                        this.setSelectedResultAbove(selectedResultAndRow.row);
                    }
                    e.preventDefault();
                    break;
                case "ArrowLeft":
                    if (selectedResultAndRow) {
                        this.setResultToStatus(selectedResultAndRow, ResultStatus.FalsePositive);
                        this.setSelectedResultBelow(selectedResultAndRow.row);
                    }
                    e.preventDefault();
                    break;
                case "ArrowRight":
                    if (selectedResultAndRow) {
                        this.setResultToStatus(selectedResultAndRow, ResultStatus.Bug);
                        this.setSelectedResultBelow(selectedResultAndRow.row);
                    }
                    e.preventDefault();
                    break;
                case "Backspace":
                    if (selectedResultAndRow) {
                        this.setResultToStatus(selectedResultAndRow, ResultStatus.Todo);
                        this.setSelectedResultBelow(selectedResultAndRow.row);
                    }
                    e.preventDefault();
                    break;
            }
        });
    }

    private initResultsFilter() {
        // 1. Set the onclick event for the filter menu button to show/hide the filter menu
        const filterMenuButton = getElementByIdOrThrow(this.FILTER_MENU_BUTTON_ID) as HTMLButtonElement;
        const filterMenu = getElementByIdOrThrow(this.FILTER_MENU_ID) as HTMLDivElement;
        filterMenuButton.onclick = () => {
            filterMenu.classList.toggle("hidden");
        };

        // 1.1 Set the onclick event for the refresh button to refresh the table
        const refreshFilterMenuButton = getElementByIdOrThrow(this.FILTER_REFRESH_BUTTON_ID) as HTMLButtonElement;
        refreshFilterMenuButton.onclick = () => {
            this.resultsTable.sort();
            this.render();
        };

        // 2. Handle the keyword filter
        const filterKeywordElement = getElementByIdOrThrow(this.FILTER_KEYWORD_ID) as HTMLTextAreaElement;
        filterKeywordElement.oninput = () => {
            const textAreaValue = filterKeywordElement.value;
            this.resultsTable.setKeywordFilter(textAreaValue);
            this.render();
        };

        // 3. Handle the include path filter
        const filterIncludePathElement = getElementByIdOrThrow(this.FILTER_INCLUDE_PATH_ID) as HTMLTextAreaElement;
        filterIncludePathElement.oninput = () => {
            const textAreaValue = filterIncludePathElement.value;
            this.resultsTable.setIncludePathFilter(textAreaValue);
            this.render();
        };

        // 4. Handle the exclude path filter
        const filterExcludePathElement = getElementByIdOrThrow(this.FILTER_EXCLUDE_PATH_ID) as HTMLTextAreaElement;
        filterExcludePathElement.oninput = () => {
            const textAreaValue = filterExcludePathElement.value;
            this.resultsTable.setExcludePathFilter(textAreaValue);
            this.render();
        };

        // 5. Handle the rule id filter
        const filterRuleIdElement = getElementByIdOrThrow(this.FILTER_RULE_ID_ID) as HTMLTextAreaElement;
        filterRuleIdElement.oninput = () => {
            const textAreaValue = filterRuleIdElement.value;
            this.resultsTable.setExcludedRuleIdFilter(textAreaValue);
            this.render();
        };

        // 6. Handle the SARIF files filter
        const filterSarifFilesElement = getElementByIdOrThrow(this.FILTER_SARIF_FILES_ID) as HTMLTextAreaElement;
        filterSarifFilesElement.oninput = () => {
            const textAreaValue = filterSarifFilesElement.value;
            this.resultsTable.setExcludedSarifFilesFilter(textAreaValue);
            this.render();
        };

        // 7. Handle the level filter
        const filterLevelErrorElement = getElementByIdOrThrow(this.FILTER_LEVEL_ERROR_ID) as HTMLInputElement;
        filterLevelErrorElement.onchange = () => {
            this.resultsTable.setLevelErrorFilter(filterLevelErrorElement.checked);
            this.render();
        };

        const filterLevelWarningElement = getElementByIdOrThrow(this.FILTER_LEVEL_WARNING_ID) as HTMLInputElement;
        filterLevelWarningElement.onchange = () => {
            this.resultsTable.setLevelWarningFilter(filterLevelWarningElement.checked);
            this.render();
        };

        const filterLevelNoteElement = getElementByIdOrThrow(this.FILTER_LEVEL_NOTE_ID) as HTMLInputElement;
        filterLevelNoteElement.onchange = () => {
            this.resultsTable.setLevelNoteFilter(filterLevelNoteElement.checked);
            this.render();
        };

        const filterLevelNoneElement = getElementByIdOrThrow(this.FILTER_LEVEL_NONE_ID) as HTMLInputElement;
        filterLevelNoneElement.onchange = () => {
            this.resultsTable.setLevelNoneFilter(filterLevelNoneElement.checked);
            this.render();
        };

        // 8. Handle the status filter
        const filterStatusTodoElement = getElementByIdOrThrow(this.FILTER_STATUS_TODO_ID) as HTMLInputElement;
        filterStatusTodoElement.onchange = () => {
            this.resultsTable.setStatusTodoFilter(filterStatusTodoElement.checked);
            this.render();
        };

        const filterStatusBugElement = getElementByIdOrThrow(this.FILTER_STATUS_BUG_ID) as HTMLInputElement;
        filterStatusBugElement.onchange = () => {
            this.resultsTable.setStatusBugFilter(filterStatusBugElement.checked);
            this.render();
        };

        const filterStatusFalsePositiveElement = getElementByIdOrThrow(
            this.FILTER_STATUS_FALSE_POSITIVE_ID,
        ) as HTMLInputElement;
        filterStatusFalsePositiveElement.onchange = () => {
            this.resultsTable.setStatusFalsePositiveFilter(filterStatusFalsePositiveElement.checked);
            this.render();
        };

        // 9. Close all button
        const closeAllRowsButton = getElementByIdOrThrow(this.CLOSE_ALL_ROWS_BUTTON_ID) as HTMLButtonElement;
        closeAllRowsButton.onclick = () => {
            for (const ruleStatus of this.ruleIdToRuleStatus.values()) {
                if (ruleStatus.opened) {
                    this.closeRuleRow(ruleStatus);
                }
            }
        };

        // 10. Settings button
        const sendBugsToWeAuditButton = getElementByIdOrThrow(this.SEND_BUGS_TO_WEAUDIT_BUTTON_ID) as HTMLButtonElement;
        sendBugsToWeAuditButton.onclick = () => {
            apiSendBugsToWeAudit(this.resultsTable.getBugs());
        };
    }

    public updateResultFiltersHTMLElements() {
        const filterData = this.resultsTable.getFilterData();

        // Based on the current filters, update the HTML elements
        const filterKeywordElement = getElementByIdOrThrow(this.FILTER_KEYWORD_ID) as HTMLTextAreaElement;
        filterKeywordElement.value = filterData.keyword;

        const filterIncludePathElement = getElementByIdOrThrow(this.FILTER_INCLUDE_PATH_ID) as HTMLTextAreaElement;
        filterIncludePathElement.value = setToStringInParts(new Set(filterData.includePaths));

        const filterExcludePathElement = getElementByIdOrThrow(this.FILTER_EXCLUDE_PATH_ID) as HTMLTextAreaElement;
        filterExcludePathElement.value = setToStringInParts(new Set(filterData.excludePaths));

        const filterRuleIdElement = getElementByIdOrThrow(this.FILTER_RULE_ID_ID) as HTMLTextAreaElement;
        filterRuleIdElement.value = setToStringInParts(new Set(filterData.excludeRuleIds));

        const filterSarifFilesElement = getElementByIdOrThrow(this.FILTER_SARIF_FILES_ID) as HTMLTextAreaElement;
        filterSarifFilesElement.value = setToStringInParts(new Set(filterData.excludeSarifFiles));

        const filterLevelErrorElement = getElementByIdOrThrow(this.FILTER_LEVEL_ERROR_ID) as HTMLInputElement;
        filterLevelErrorElement.checked = filterData.includeLevelError;

        const filterLevelWarningElement = getElementByIdOrThrow(this.FILTER_LEVEL_WARNING_ID) as HTMLInputElement;
        filterLevelWarningElement.checked = filterData.includeLevelWarning;

        const filterLevelNoteElement = getElementByIdOrThrow(this.FILTER_LEVEL_NOTE_ID) as HTMLInputElement;
        filterLevelNoteElement.checked = filterData.includeLevelNote;

        const filterLevelNoneElement = getElementByIdOrThrow(this.FILTER_LEVEL_NONE_ID) as HTMLInputElement;
        filterLevelNoneElement.checked = filterData.includeLevelNone;

        const filterStatusTodoElement = getElementByIdOrThrow(this.FILTER_STATUS_TODO_ID) as HTMLInputElement;
        filterStatusTodoElement.checked = filterData.includeStatusTodo;

        const filterStatusBugElement = getElementByIdOrThrow(this.FILTER_STATUS_BUG_ID) as HTMLInputElement;
        filterStatusBugElement.checked = filterData.includeStatusBug;

        const filterStatusFalsePositiveElement = getElementByIdOrThrow(
            this.FILTER_STATUS_FALSE_POSITIVE_ID,
        ) as HTMLInputElement;
        filterStatusFalsePositiveElement.checked = filterData.includeStatusFalsePositive;
    }

    public globalOnClick(_e: MouseEvent) {
        // TODO: Consider closing the filter menu here
    }

    // ====================
    // Utils
    // ====================
    private resultToResultAndRow(result: Result): ResultAndRow {
        const resultId = result.getResultIdWithSarifPath();
        const ruleId = result.getRuleId();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const resultAndRow = this.ruleIdToRuleStatus.get(ruleId)!.results.get(resultId)!;
        return resultAndRow;
    }

    // ====================
    // Table manipulation functions
    // ====================
    private createRuleElement(rule: Rule): HTMLTableRowElement {
        // Create the table row
        const row = document.createElement("tr");
        row.classList.add(this.RULE_ROW_CLASS);
        row.id = rule.id;
        row.title = rule.id;

        // Add the dropdown arrow
        {
            const cell = row.insertCell();
            cell.classList.add("iconCell");

            const cellDiv = document.createElement("div");
            cellDiv.classList.add("cellContainer");

            const div = document.createElement("div");
            div.classList.add("codicon");
            div.classList.add(this.RULE_ROW_CLOSED_CLASS);

            cellDiv.appendChild(div);
            cell.appendChild(cellDiv);
        }

        // Add the rule name
        {
            const cell = row.insertCell();
            cell.classList.add("ruleNameCell");
            cell.colSpan = 3; // Go over all 3 extra columns

            const cellContainer = document.createElement("div");
            cellContainer.classList.add("cellWithButtons");

            const content = document.createElement("div");
            content.classList.add("cellContainer");
            content.classList.add("cellWithButtonsContent");

            const div0 = this.createResultLevelIcon(rule.level);

            const divSpace = document.createElement("span");
            divSpace.innerHTML = "&nbsp;";

            const div1 = document.createElement("div");
            div1.classList.add("ellipsis-beginning");
            div1.innerText = rule.name;

            const div2 = document.createElement("div");
            if (rule.name !== rule.id) {
                div2.classList.add("secondaryText");
                div2.classList.add("ellipsis");
                div2.innerText = rule.id;
            }

            const div3 = document.createElement("div");
            div3.classList.add("countBadge");
            div3.innerText = "0"; // Updated on render

            const div4 = document.createElement("div");
            div4.classList.add(this.RULE_ROW_FILTERED_SUMMARY_CLASS);
            div4.innerText = ""; // Updated on render

            content.appendChild(div0);
            content.appendChild(divSpace);
            content.appendChild(div1);
            content.appendChild(div2);
            content.appendChild(div3);
            content.appendChild(div4);

            // The buttons that will be displayed on the right of the message
            const rowButtons = document.createElement("div");
            rowButtons.classList.add("rowButtons");

            const exportAllBugsInRuleAsGHIssue = document.createElement("div");
            exportAllBugsInRuleAsGHIssue.title = "Export every visible result as one GitHub issue";
            exportAllBugsInRuleAsGHIssue.classList.add("rowButton");
            exportAllBugsInRuleAsGHIssue.classList.add("codicon");
            exportAllBugsInRuleAsGHIssue.classList.add("codicon-github-alt");
            exportAllBugsInRuleAsGHIssue.onclick = (e) => {
                e.stopPropagation();

                const bugList: Result[] = [];
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                for (const resultAndRow of this.ruleIdToRuleStatus.get(rule.id)!.results.values()) {
                    if (!this.resultsTable.isResultFiltered(resultAndRow.result)) {
                        bugList.push(resultAndRow.result);
                    }
                }

                apiExportGitHubIssue(bugList);
            };

            const toggleHideAllResultsFromRuleButton = document.createElement("div");
            toggleHideAllResultsFromRuleButton.title = "Hide/show this rule's results";
            toggleHideAllResultsFromRuleButton.classList.add("rowButton");
            toggleHideAllResultsFromRuleButton.classList.add("codicon");
            const filterRuleIdElement = getElementByIdOrThrow(this.FILTER_RULE_ID_ID) as HTMLTextAreaElement;
            const updateRuleHideStatus = () => {
                // Add this ruleID to the FILTER_RULE_ID filter
                const ruleIds = splitStringInParts(filterRuleIdElement.value);
                if (rule.isHidden) {
                    ruleIds.add(rule.id);
                    // Update the "hide" button with the correct icon
                    toggleHideAllResultsFromRuleButton.classList.remove("codicon-eye");
                    toggleHideAllResultsFromRuleButton.classList.add("codicon-eye-closed");
                } else {
                    ruleIds.delete(rule.id);
                    // Update the "hide" button with the correct icon
                    toggleHideAllResultsFromRuleButton.classList.remove("codicon-eye-closed");
                    toggleHideAllResultsFromRuleButton.classList.add("codicon-eye");
                }

                filterRuleIdElement.value = setToStringInParts(ruleIds);
            };

            toggleHideAllResultsFromRuleButton.onclick = (e) => {
                e.stopPropagation();

                rule.isHidden = !rule.isHidden;
                updateRuleHideStatus();
                // trigger the input event to update the filter
                filterRuleIdElement.dispatchEvent(new Event("input"));

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const ruleStatus: RuleStatus = this.ruleIdToRuleStatus.get(rule.id)!;
                for (const sarifFilePath of ruleStatus.sarifFilePaths) {
                    apiSetHiddenRule(sarifFilePath, rule.id, rule.isHidden);
                }
            };

            // Update the "hide" button with the correct icon, etc.
            updateRuleHideStatus();

            rowButtons.appendChild(exportAllBugsInRuleAsGHIssue);
            rowButtons.appendChild(toggleHideAllResultsFromRuleButton);

            cellContainer.appendChild(content);
            cellContainer.appendChild(rowButtons);
            cell.appendChild(cellContainer);
        }

        row.onclick = () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const ruleStatus = this.ruleIdToRuleStatus.get(rule.id)!;
            this.toggleRuleRowOpened(ruleStatus);
        };

        return row;
    }

    // Get a result's path based on the VSCode configuration
    private getResultDisplayPathAndLine(result: Result): string {
        const location = result.getResultPrimaryLocation();
        const line = location.region.startLine;
        const fullPath = location.path;

        let res = "";
        if (this.vscodeConfig.showFullPathInResultsTable) {
            res = fullPath;
        } else {
            res = getPathLeaf(fullPath);
        }

        res += ":" + line.toString();
        return res;
    }

    private createResultElement(result: Result): HTMLTableRowElement {
        const location: ResultLocation = result.getResultPrimaryLocation();

        const line = location.region.startLine;
        const fullPath = location.path;
        const displayPathAndLine = this.getResultDisplayPathAndLine(result);

        // Create the table row
        const row = document.createElement("tr");
        row.classList.add("hidden");
        row.id = result.getResultIdWithSarifPath();
        row.title = fullPath + ":" + line.toString();

        // Add the fake column for the dropdown arrow
        {
            const cell = row.insertCell();
            cell.classList.add("iconCell");
        }

        // Add status symbol
        {
            const cell = row.insertCell();
            cell.classList.add("statusCell");

            const cellDiv = document.createElement("div");
            cellDiv.classList.add("cellContainer");
            cellDiv.classList.add("statusCellContainer");

            const div0 = document.createElement("div");
            div0.classList.add("codicon");
            div0.classList.add(this.NOTE_STATUS_ICON_ID);
            cellDiv.appendChild(div0);

            const div1 = document.createElement("div");
            div1.classList.add("codicon");
            div1.classList.add(this.STATUS_ICON_ID);
            cellDiv.appendChild(div1);

            cell.appendChild(cellDiv);
        }

        // Add the file column
        {
            const cell = row.insertCell();
            cell.classList.add("resultPathCell");
            cell.innerText = displayPathAndLine;
        }

        // Add the message column
        {
            const cell = row.insertCell();
            cell.classList.add("cellWithButtons");

            // The message content
            const messageDiv = document.createElement("div");
            messageDiv.classList.add("cellWithButtonsContent");
            for (const el of result.messageToHTML(result.getMessage(), true)) {
                messageDiv.appendChild(el);
            }
            cell.title = result.getMessage();

            // The buttons that will be displayed on the right of the message
            const resultButtons = this.createResultButtons({ result, row });

            cell.appendChild(messageDiv);
            cell.appendChild(resultButtons);
        }

        this.updateResultRowStatus({ result, row });
        this.updateResultRowComment({ result, row });

        // Add the onclick event which will open the file at the specific line
        row.onclick = () => {
            result.openPrimaryCodeRegion();
            this.selectedResult.setResult({
                row: row,
                result: result,
            });
        };

        return row;
    }

    public createResultButtons(resultAndRow: ResultAndRow): HTMLDivElement {
        const result = resultAndRow.result;

        const rowButtons = document.createElement("div");
        rowButtons.classList.add("rowButtons");

        const exportGhButton = document.createElement("div");
        exportGhButton.classList.add("rowButton");
        exportGhButton.classList.add("codicon");
        exportGhButton.classList.add("codicon-github-alt");
        exportGhButton.title = "Export result as GitHub issue";
        exportGhButton.onclick = (e) => {
            e.stopPropagation();
            result.exportAsGHIssue();
        };

        const copyPermalinkButton = document.createElement("div");
        copyPermalinkButton.classList.add("rowButton");
        copyPermalinkButton.classList.add("codicon");
        copyPermalinkButton.classList.add("codicon-link");
        copyPermalinkButton.title = "Copy result's GitHub permalink";
        copyPermalinkButton.onclick = (e) => {
            e.stopPropagation();
            result.copyPermalink();
        };

        const setStatusAsBugButton = document.createElement("div");
        setStatusAsBugButton.classList.add("rowButton");
        setStatusAsBugButton.classList.add("codicon");
        setStatusAsBugButton.classList.add(this.BUG_CODICON);
        setStatusAsBugButton.classList.add(this.BUG_ICON_CLASS);
        setStatusAsBugButton.title = "Mark result as BUG (ArrowRight)";
        if (result.getStatus() === ResultStatus.Bug) {
            setStatusAsBugButton.classList.add("currentStatus");
        }
        setStatusAsBugButton.onclick = (e) => {
            e.stopPropagation();
            result.setStatus(ResultStatus.Bug);
            this.updateResultRowStatus(resultAndRow);
        };

        const setStatusAsFalsePositiveButton = document.createElement("div");
        setStatusAsFalsePositiveButton.classList.add("rowButton");
        setStatusAsFalsePositiveButton.classList.add("codicon");
        setStatusAsFalsePositiveButton.classList.add(this.FALSE_POSITIVE_CODICON);
        setStatusAsFalsePositiveButton.classList.add(this.FALSE_POSITIVE_ICON_CLASS);
        setStatusAsFalsePositiveButton.title = "Mark result as FALSE POSITIVE (ArrowLeft)";
        if (result.getStatus() === ResultStatus.FalsePositive) {
            setStatusAsFalsePositiveButton.classList.add("currentStatus");
        }
        setStatusAsFalsePositiveButton.onclick = (e) => {
            e.stopPropagation();
            result.setStatus(ResultStatus.FalsePositive);
            this.updateResultRowStatus(resultAndRow);
        };

        const setStatusAsTodoButton = document.createElement("div");
        setStatusAsTodoButton.classList.add("rowButton");
        setStatusAsTodoButton.classList.add("codicon");
        setStatusAsTodoButton.classList.add(this.TODO_CODICON);
        setStatusAsTodoButton.classList.add(this.TODO_ICON_CLASS);
        setStatusAsTodoButton.title = "Mark result as TODO (Backspace)";
        if (result.getStatus() === ResultStatus.Todo) {
            setStatusAsTodoButton.classList.add("currentStatus");
        }
        setStatusAsTodoButton.onclick = (e) => {
            e.stopPropagation();
            result.setStatus(ResultStatus.Todo);
            this.updateResultRowStatus(resultAndRow);
        };

        const rowButtonDivider = document.createElement("div");
        rowButtonDivider.classList.add("rowButtonDivider");

        rowButtons.appendChild(setStatusAsBugButton);
        rowButtons.appendChild(setStatusAsFalsePositiveButton);
        rowButtons.appendChild(setStatusAsTodoButton);
        rowButtons.appendChild(rowButtonDivider);
        rowButtons.appendChild(exportGhButton);
        rowButtons.appendChild(copyPermalinkButton);

        return rowButtons;
    }

    public createResultLevelIcon(level: ResultLevel): HTMLSpanElement {
        const div = document.createElement("span");
        div.classList.add("codicon");
        div.title = ResultLevel[level];
        switch (level) {
            case ResultLevel.error:
                div.classList.add("codicon-error");
                div.classList.add("errorIcon");
                break;
            case ResultLevel.warning:
                div.classList.add("codicon-warning");
                div.classList.add("warningIcon");
                break;
            case ResultLevel.note:
                div.classList.add("codicon-note");
                div.classList.add("noteIcon");
                break;
            case ResultLevel.none:
                div.classList.add("codicon-note");
                div.classList.add("noneIcon");
                break;
        }
        return div;
    }

    private openRuleRow(ruleStatus: RuleStatus) {
        ruleStatus.opened = true;

        // Make all children result visible on click
        const selectedResultId =
            this.selectedResult.getResultEvenIfNotBeingDisplayed()?.getResultIdWithSarifPath() || "fakeId";
        for (const resultAndRow of ruleStatus.results.values()) {
            if (selectedResultId === resultAndRow.result.getResultIdWithSarifPath()) {
                this.selectedResult.setIsBeingDisplayed(true);
            }
            resultAndRow.row.classList.remove("hidden");
        }

        const dropdownIcon = ruleStatus.row.getElementsByClassName("codicon")[0];
        dropdownIcon.classList.remove(this.RULE_ROW_CLOSED_CLASS);
        dropdownIcon.classList.add(this.RULE_ROW_OPENED_CLASS);
    }

    private closeRuleRow(ruleStatus: RuleStatus) {
        ruleStatus.opened = false;

        const selectedResultId = this.selectedResult.getResult()?.getResultIdWithSarifPath() || "fakeId";
        for (const resultAndRow of ruleStatus.results.values()) {
            if (selectedResultId === resultAndRow.result.getResultIdWithSarifPath()) {
                this.selectedResult.setIsBeingDisplayed(false);
            }
            resultAndRow.row.classList.add("hidden");
        }

        const dropdownIcon = ruleStatus.row.getElementsByClassName("codicon")[0];
        dropdownIcon.classList.remove(this.RULE_ROW_OPENED_CLASS);
        dropdownIcon.classList.add(this.RULE_ROW_CLOSED_CLASS);
    }

    private toggleRuleRowOpened(ruleStatus: RuleStatus) {
        // If the rule is filtered out, don't do anything
        if (ruleStatus.filteredOut || ruleStatus.rule.isHidden) {
            return;
        }

        if (ruleStatus.opened) {
            this.closeRuleRow(ruleStatus);
        } else {
            this.openRuleRow(ruleStatus);
        }
    }

    private updateResultRowStatus(resultAndRow: ResultAndRow) {
        const row = resultAndRow.row;
        const result = resultAndRow.result;

        // Get the status cell with the codicon
        const statusDiv = row.getElementsByClassName(this.STATUS_ICON_ID)[0] as HTMLDivElement;

        // Remove all status icons
        statusDiv.classList.remove(this.TODO_CODICON);
        statusDiv.classList.remove(this.TODO_ICON_CLASS);
        statusDiv.classList.remove(this.FALSE_POSITIVE_CODICON);
        statusDiv.classList.remove(this.FALSE_POSITIVE_ICON_CLASS);
        statusDiv.classList.remove(this.BUG_CODICON);
        statusDiv.classList.remove(this.BUG_ICON_CLASS);

        // Add the correct status icon
        switch (result.getStatus()) {
            case ResultStatus.Todo:
                statusDiv.classList.add(this.TODO_CODICON);
                statusDiv.classList.add(this.TODO_ICON_CLASS);
                break;
            case ResultStatus.FalsePositive:
                statusDiv.classList.add(this.FALSE_POSITIVE_CODICON);
                statusDiv.classList.add(this.FALSE_POSITIVE_ICON_CLASS);
                break;
            case ResultStatus.Bug:
                statusDiv.classList.add(this.BUG_CODICON);
                statusDiv.classList.add(this.BUG_ICON_CLASS);
                break;
            default:
                throw new Error(`Unknown result status ${result.getStatus()}`);
        }

        statusDiv.title = "Result marked as " + ResultStatus[result.getStatus()].toUpperCase();

        // Update the "currentStatus" button
        const updateStatusOfRowButtons = (rowButtons: Element) => {
            for (let i = 0; i < rowButtons.children.length; i++) {
                const rowButton = rowButtons.children[i];
                switch (result.getStatus()) {
                    case ResultStatus.Todo:
                        if (rowButton.classList.contains(this.TODO_CODICON)) {
                            rowButton.classList.add("currentStatus");
                        } else {
                            rowButton.classList.remove("currentStatus");
                        }
                        break;
                    case ResultStatus.FalsePositive:
                        if (rowButton.classList.contains(this.FALSE_POSITIVE_CODICON)) {
                            rowButton.classList.add("currentStatus");
                        } else {
                            rowButton.classList.remove("currentStatus");
                        }
                        break;
                    case ResultStatus.Bug:
                        if (rowButton.classList.contains(this.BUG_CODICON)) {
                            rowButton.classList.add("currentStatus");
                        } else {
                            rowButton.classList.remove("currentStatus");
                        }
                        break;
                    default:
                        throw new Error(`Unknown result status ${result.getStatus()}`);
                }
            }
        };

        // Update our row of buttons
        const rowButtonsTable = row.getElementsByClassName("rowButtons")[0];
        updateStatusOfRowButtons(rowButtonsTable);

        // Update the new detail view buttons
        const rowButtonsDetails = this.detailsWidget.getButtons().getElementsByClassName("rowButtons");
        if (rowButtonsDetails.length > 0) {
            updateStatusOfRowButtons(rowButtonsDetails[0]);
        }
    }

    public updateResultRowComment(resultAndRow: ResultAndRow) {
        const row = resultAndRow.row;
        const result = resultAndRow.result;

        // Get the status cell with the codicon
        const noteDiv = row.getElementsByClassName(this.NOTE_STATUS_ICON_ID)[0] as HTMLDivElement;

        if (result.hasComment()) {
            // Add the note icon
            noteDiv.classList.add(this.NOTE_ICON);
            noteDiv.classList.add(this.NOTE_ICON_CLASS);

            noteDiv.title = 'This result has the note: "' + result.getComment() + '"';
        } else {
            // Remove the note icon
            noteDiv.classList.remove(this.NOTE_ICON);
            noteDiv.classList.remove(this.NOTE_ICON_CLASS);

            noteDiv.title = "";
        }
    }

    private updateResultRowPath(resultAndRow: ResultAndRow) {
        const row = resultAndRow.row;
        const result = resultAndRow.result;

        // Update the file path
        const pathCell = row.getElementsByClassName("resultPathCell")[0] as HTMLTableCellElement;
        pathCell.innerText = this.getResultDisplayPathAndLine(result);
    }

    // Adds the results of a whole sarifFile to the table
    public addResults(sarifFile: SarifFile) {
        const results = sarifFile.getResults();
        this.resultsTable.addResultsAndSort(results);
        this.amountOfSarifFilesLoaded++;

        // Create a row for each result and rule row
        for (let i = 0; i < results.length; i++) {
            const result = results[i];

            // Create the result row and cache it
            const row = this.createResultElement(result);
            const resultAndRow = { result: result, row: row };

            // Create the rule row and cache it
            const ruleId = result.getRuleId();
            let ruleStatus = this.ruleIdToRuleStatus.get(ruleId);
            if (ruleStatus === undefined) {
                // If we don't have an object for this rule, create one
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const rule = sarifFile.getRule(ruleId)!;
                const ruleRow = this.createRuleElement(rule);
                ruleStatus = {
                    row: ruleRow,
                    rule: rule,
                    results: new Map(),
                    sarifFilePaths: [result.getAssociatedSarifPath()],
                    opened: false,
                    filteredOut: false,
                };
                this.ruleIdToRuleStatus.set(ruleId, ruleStatus);
            } else if (!ruleStatus.sarifFilePaths.includes(result.getAssociatedSarifPath())) {
                // If we have an object for this rule, but it is from a different file, add the file to the list
                ruleStatus.sarifFilePaths.push(result.getAssociatedSarifPath());
            }

            // Add the result to the rule entry
            ruleStatus.results.set(result.getResultIdWithSarifPath(), resultAndRow);
        }

        const filterRuleIdElement = getElementByIdOrThrow(this.FILTER_RULE_ID_ID) as HTMLTextAreaElement;
        // This will call render
        filterRuleIdElement.dispatchEvent(new Event("input"));
    }

    // Removes the results of a whole sarifFile to the table
    public removeResults(sarifFile: SarifFile) {
        const results = sarifFile.getResults();
        this.amountOfSarifFilesLoaded--;

        this.resultsTable.removeResultsFromSarifPath(sarifFile.getSarifFilePath());

        const selectedResultOrNull = this.selectedResult.getResultEvenIfNotBeingDisplayed();
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const resultAndRow = this.resultToResultAndRow(result);

            // Remove the result from the rule
            const resultId = result.getResultIdWithSarifPath();
            const ruleId = resultAndRow.result.getRuleId();
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const ruleStatus = this.ruleIdToRuleStatus.get(ruleId)!;
            const ruleResults = ruleStatus.results;
            ruleResults.delete(resultId);

            if (ruleResults.size === 0) {
                // If there are no more results for this rule, remove the rule row
                ruleStatus.row.remove();
                this.ruleIdToRuleStatus.delete(ruleId);
            }

            // Clear the selection if the selected result is being removed
            if (selectedResultOrNull && selectedResultOrNull.getResultIdWithSarifPath() === resultId) {
                this.selectedResult.clearSelection();
            }

            // Remove the result from the UI
            resultAndRow.row.remove();
        }

        this.render();
    }

    // Re-renders the table based on the this.resultsTable object
    public render() {
        // ====================
        // If the table is empty, just render a button that allows the user to open SARIF files
        if (this.amountOfSarifFilesLoaded == 0) {
            this.resultsTab.classList.add("hidden");
            this.sarifFilesTab.classList.add("hidden");
            this.noFilesOpenedContainer.classList.remove("hidden");
            return;
        }

        // If results are being shown, ensure the tabs are visible
        this.resultsTab.classList.remove("hidden");
        this.sarifFilesTab.classList.remove("hidden");
        this.noFilesOpenedContainer.classList.add("hidden");

        // ====================
        // Add the status icon to the header we are sorting by
        const sortStatus = this.resultsTable.getSortConfig();
        const tableHeaders = this.tableElement.getElementsByTagName("th");
        for (let i = 0; i < tableHeaders.length; i++) {
            const th = tableHeaders[i];
            const statusIcon = th.getElementsByClassName("resultsTableStatusIcon")[0] as HTMLDivElement;
            statusIcon.classList.add("codicon");

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const headerId = parseInt(th.getAttribute(this.TABLE_HEADER_INDEX)!) as TableHeaders;

            if (headerId === sortStatus.mainHeader) {
                // Set the status icon on the main header we are sorting by
                if (sortStatus.mainDirection === SortDirection.Ascending) {
                    statusIcon.classList.remove("codicon-arrow-small-down");
                    statusIcon.classList.add("codicon-arrow-small-up");
                } else {
                    statusIcon.classList.remove("codicon-arrow-small-up");
                    statusIcon.classList.add("codicon-arrow-small-down");
                }
                statusIcon.classList.remove("invisible");
            } else {
                // Ensure any other header icon is hidden
                statusIcon.classList.add("invisible");
            }
        }

        // ====================
        // Remove all rows from the table
        const tableBody = this.tableElement.tBodies[0];
        tableBody.innerText = "";

        // ====================
        // Add each result to the table in the order they are in the this.resultTable object
        const results = this.resultsTable.getFilteredResults();

        // Handle selecting/deselecting the selected result
        const selectedResultOrNull = this.selectedResult.getResultEvenIfNotBeingDisplayed();
        let isSelectedResultDisplayed = false;

        // Pack each result into per rule separators
        const visitedRules = new Set();
        let lastSeenRuleId = "";
        let lastRuleShownResultsCount = 0;

        for (let i = 0; i < results.length; i++) {
            const result = results[i];

            // If we have a new rule, render it
            const ruleId = result.getRuleId();
            if (ruleId !== lastSeenRuleId) {
                // Update the previous rule row
                if (lastSeenRuleId !== "") {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const lastRuleStatus = this.ruleIdToRuleStatus.get(lastSeenRuleId)!;
                    this.updateRuleRow(lastRuleStatus, lastRuleShownResultsCount);
                }

                // Append the new rule row
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const newRuleStatus = this.ruleIdToRuleStatus.get(ruleId)!;
                tableBody.appendChild(newRuleStatus.row);

                lastSeenRuleId = ruleId;
                lastRuleShownResultsCount = 0;
                visitedRules.add(ruleId);
            }

            lastRuleShownResultsCount += 1;

            // Render the result
            const row = this.resultToResultAndRow(result).row;
            tableBody.appendChild(row);

            // Hidden results are not selectable
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (this.ruleIdToRuleStatus.get(ruleId)!.opened === false) {
                continue;
            }

            // If the selected result is in the filtered results, note that we found it
            if (
                selectedResultOrNull &&
                selectedResultOrNull.getResultIdWithSarifPath() === result.getResultIdWithSarifPath()
            ) {
                isSelectedResultDisplayed = true;
            }
        }

        // Update the last rule row
        const lastRuleStatus = this.ruleIdToRuleStatus.get(lastSeenRuleId);
        if (lastRuleStatus) {
            this.updateRuleRow(lastRuleStatus, lastRuleShownResultsCount);
        }

        // Sort the remaining list of rules how the results table does
        const ruleStatusList = [...this.ruleIdToRuleStatus.values()];
        ruleStatusList.sort((a, b): number => {
            return this.resultsTable.compareRule(a.rule, b.rule);
        });

        for (const ruleStatus of ruleStatusList) {
            // Add any rules that were not in the filtered results
            if (!visitedRules.has(ruleStatus.rule.id)) {
                this.updateRuleRow(ruleStatus, 0);
                tableBody.appendChild(ruleStatus.row);
            }
        }

        // If the selected result is not in the filtered results, keep it selected but mark it as not being displayed
        // This enables results to stay selected when hidden but give us a way to prevent actions on them
        if (selectedResultOrNull) {
            this.selectedResult.setIsBeingDisplayed(isSelectedResultDisplayed);
        } else {
            this.detailsWidget.clearDetails();
        }

        // NOTE: We could scroll the selected result into view here, but it may be more annoying than helpful
        // this.scrollToSelectedResult();
    }

    private updateRuleRow(ruleStatus: RuleStatus, shownResultsCount: number) {
        const row = ruleStatus.row;
        const totalResultsCount = ruleStatus.results.size;
        const filteredCount = totalResultsCount - shownResultsCount;

        // Update the summary
        {
            const ruleSummary = row.getElementsByClassName(this.RULE_ROW_FILTERED_SUMMARY_CLASS)[0] as HTMLDivElement;
            if (ruleStatus.rule.isHidden) {
                ruleSummary.innerText = "(" + filteredCount + " hidden)";
            } else if (filteredCount !== 0) {
                ruleSummary.innerText = "(" + filteredCount + " filtered)";
            } else {
                ruleSummary.innerText = "";
            }
        }

        // Update the count badge
        {
            const badgeCount = row.getElementsByClassName("countBadge")[0] as HTMLDivElement;
            badgeCount.textContent = shownResultsCount.toString();
        }

        // Handle greying out and closing rules when state changes
        if (shownResultsCount === 0) {
            // 1. All results are filtered---change the columns style and prevent opening it
            // Close an opened rule
            if (ruleStatus.rule.isHidden) {
                if (ruleStatus.opened) {
                    this.closeRuleRow(ruleStatus);
                }
            } else {
                if (ruleStatus.opened && !ruleStatus.filteredOut) {
                    this.closeRuleRow(ruleStatus);
                    // This is weird but here because we need to know that the rule was opened and is closed only because it is filtered out
                    ruleStatus.opened = true;
                }
            }

            ruleStatus.filteredOut = true;

            // Add the grey out
            row.classList.add(this.RULE_ROW_FILTERED_OUT_CLASS);
            row.classList.add("filteredOutRowNoClick");
        } else {
            if (ruleStatus.filteredOut) {
                if (ruleStatus.opened) {
                    // Open a closed rule if it was previously opened
                    this.openRuleRow(ruleStatus);
                }

                // Remove the grey out
                row.classList.remove(this.RULE_ROW_FILTERED_OUT_CLASS);
                row.classList.remove("filteredOutRowNoClick");

                ruleStatus.filteredOut = false;
            }
        }
    }

    // ====================
    // Selected result functions
    // ====================
    private isRuleRowOpened(row: HTMLTableRowElement): boolean {
        const dropdownIcon = row.getElementsByClassName("codicon")[0];
        return dropdownIcon.classList.contains(this.RULE_ROW_OPENED_CLASS);
    }

    private scrollToSelectedResult() {
        const selectedRow = this.selectedResult.getRow();
        if (selectedRow) {
            scrollToRow(selectedRow);
        }
    }

    public setSelectedResultBelow(selectedRow: HTMLTableRowElement) {
        let nextRow = selectedRow.nextElementSibling as HTMLTableRowElement;
        if (!nextRow) {
            return;
        }

        if (nextRow.classList.contains(this.RULE_ROW_CLASS)) {
            if (!this.isRuleRowOpened(nextRow)) {
                // Open the rule row
                nextRow.click();
            }
            nextRow = nextRow.nextElementSibling as HTMLTableRowElement;
        }

        // If we just open a rule row above (or it was already open), the next row has to be a result row
        console.assert(nextRow && !nextRow.classList.contains(this.RULE_ROW_CLASS));

        scrollToRow(nextRow);
        nextRow.click();
    }

    public setSelectedResultAbove(selectedRow: HTMLTableRowElement) {
        let prevRow = selectedRow.previousElementSibling as HTMLTableRowElement;
        if (!prevRow) {
            return;
        }

        if (prevRow.classList.contains(this.RULE_ROW_CLASS)) {
            // We found our own rule row, so we need to look one further
            prevRow = prevRow.previousElementSibling as HTMLTableRowElement;
            if (!prevRow) {
                return;
            }

            // The previous rule row will always be a result, but it might be hidden
            console.assert(!prevRow.classList.contains(this.RULE_ROW_CLASS));
            if (prevRow.classList.contains("hidden")) {
                let previousRuleRow = prevRow;
                while (previousRuleRow.classList.contains("hidden")) {
                    previousRuleRow = previousRuleRow.previousElementSibling as HTMLTableRowElement;
                }

                // Since we found hidden results, the rule row must be closed
                console.assert(!this.isRuleRowOpened(previousRuleRow));
                // Open the rule row
                previousRuleRow.click();
            }
        }

        // If we just open a rule row above (or it was already open), the prev row has to be a result row
        console.assert(!prevRow.classList.contains(this.RULE_ROW_CLASS) && !prevRow.classList.contains("hidden"));

        scrollToRow(prevRow);
        prevRow.click();
    }

    public setResultToStatus(resultAndRow: ResultAndRow, status: ResultStatus) {
        resultAndRow.result.setStatus(status);
        this.updateResultRowStatus(resultAndRow);

        // We could sort when we set a status, but this makes the UI move around which is unpleasant
        // this.resultsTable.sort();
        // this.render();
    }

    // ====================
    // VSCode config functions
    // ====================
    public updateVSCodeConfig(config: VSCodeConfig) {
        this.vscodeConfig = config;

        // Update the result rows
        for (const ruleStatus of this.ruleIdToRuleStatus.values()) {
            for (const resultAndRow of ruleStatus.results.values()) {
                this.updateResultRowPath(resultAndRow);
            }
        }
    }

    // ====================
    // Getter functions
    public getBugs(): Result[] {
        return this.resultsTable.getBugs();
    }
}
