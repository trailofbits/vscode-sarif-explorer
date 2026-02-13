import { FilterData } from "../../shared/filterData";
import { ResultStatus, Rule } from "../../shared/resultTypes";
import { Result } from "./result";
import { ResultsTableFilters } from "./resultFilters";

/* eslint-disable @typescript-eslint/naming-convention */
export enum SortDirection {
    Ascending = "asc",
    Descending = "desc",
}

export enum TableHeaders {
    FakeHeaderDropdownSymbol = 0,
    StatusSymbol = 1,
    File = 2,
    Message = 3,
    Line = 4,
    RuleID = 5,
}
/* eslint-enable @typescript-eslint/naming-convention */

type SortConfig = {
    // The unchanged header to sort by (e.g., the rule ID)
    unchangeableSortHeader: TableHeaders;
    // The main header to sort by
    mainHeader: TableHeaders;
    // The direction to sort by the main header
    mainDirection: SortDirection;
    // The secondary header to sort by
    secondaryHeader: TableHeaders;
    // The direction to sort by the secondary header
    secondaryDirection: SortDirection;
};

export class ResultsTable {
    private results: Result[] = [];
    private sortConfig: SortConfig = {
        unchangeableSortHeader: TableHeaders.RuleID,

        mainHeader: TableHeaders.File,
        mainDirection: SortDirection.Ascending,
        secondaryHeader: TableHeaders.Message,
        secondaryDirection: SortDirection.Ascending,
    };
    private filters: ResultsTableFilters = new ResultsTableFilters();

    public getFilterData(): FilterData {
        return this.filters.getFilterData();
    }

    // ====================
    // results-related functions
    // ====================
    // Returns the results in the table without the ones which are filtered
    public getFilteredResults(): Result[] {
        return this.results.filter((result): boolean => this.filters.filter(result));
    }

    public isResultFiltered(result: Result): boolean {
        return !this.filters.filter(result);
    }

    public isSarifFileFiltered(path: string): boolean {
        return this.filters.getFilterData().excludeSarifFiles.includes(path);
    }

    public getBugs(): Result[] {
        return this.results.filter((result): boolean => result.getStatus() === ResultStatus.Bug);
    }

    // Add SARIF file to the list of open SARIF files
    public addResultsAndSort(results: Result[]): void {
        this.results = this.results.concat(results);

        // After appending the results to the end, sort them
        this.sort();
    }

    // Remove results based on their associated SARIF file path
    public removeResultsFromSarifPath(path: string): void {
        this.results = this.results.filter((result): boolean => result.getAssociatedSarifPath() !== path);
    }

    // Remove results based on their associated SARIF file path
    public isEmpty(): boolean {
        return this.results.length === 0;
    }

    // ====================
    // Sort functions
    // ====================
    public getSortConfig(): SortConfig {
        return this.sortConfig;
    }

    public setSortConfig(sortConfig: SortConfig): void {
        this.sortConfig = sortConfig;
    }

    public setSortConfigAndSort(sortConfig: SortConfig): void {
        this.setSortConfig(sortConfig);
        this.sort();
    }

    public sortByHeader(headerToSortBy: TableHeaders): void {
        if (this.sortConfig.mainHeader === headerToSortBy) {
            // If the column is already sorted, keep the same secondary header and reverse the sort direction
            this.setSortConfigAndSort({
                unchangeableSortHeader: this.sortConfig.unchangeableSortHeader,

                mainHeader: headerToSortBy,
                mainDirection: this.sortConfig.mainDirection === SortDirection.Ascending ? SortDirection.Descending : SortDirection.Ascending,
                secondaryHeader: this.sortConfig.secondaryHeader,
                secondaryDirection: this.sortConfig.secondaryDirection,
            });
        } else {
            // If the column is not sorted, sort it ascending
            this.setSortConfigAndSort({
                unchangeableSortHeader: this.sortConfig.unchangeableSortHeader,

                mainHeader: headerToSortBy,
                mainDirection: SortDirection.Ascending,
                secondaryHeader: this.sortConfig.mainHeader,
                secondaryDirection: this.sortConfig.mainDirection,
            });
        }
    }

    public sort(): void {
        const sc = this.sortConfig;

        // Our sorting function: it compares values and if they are equal, it keeps the original order
        const compareFunction = (r1: Result, r2: Result): number => {
            let res = this.compareResultsBy(r1, r2, sc.unchangeableSortHeader, SortDirection.Ascending);
            if (res === 0) {
                res = this.compareResultsBy(r1, r2, sc.mainHeader, sc.mainDirection);
                if (res === 0) {
                    res = this.compareResultsBy(r1, r2, sc.secondaryHeader, sc.secondaryDirection);
                }
            }
            return res;
        };

        // Sort the values
        this.results.sort(compareFunction);
    }

    private compareResultsBy(r1: Result, r2: Result, header: TableHeaders, direction: SortDirection): number {
        switch (header) {
            case TableHeaders.FakeHeaderDropdownSymbol:
                throw new Error("Cannot sort by the fake header");
            case TableHeaders.StatusSymbol:
                if (r1.getStatus() < r2.getStatus()) {
                    return direction === SortDirection.Ascending ? -1 : 1;
                } else if (r1.getStatus() > r2.getStatus()) {
                    return direction === SortDirection.Ascending ? 1 : -1;
                } else {
                    if (r1.hasComment() && !r2.hasComment()) {
                        return direction === SortDirection.Ascending ? -1 : 1;
                    } else if (!r1.hasComment() && r2.hasComment()) {
                        return direction === SortDirection.Ascending ? 1 : -1;
                    } else {
                        return 0;
                    }
                }
            case TableHeaders.File:
                if (r1.getResultPath() < r2.getResultPath()) {
                    return direction === SortDirection.Ascending ? -1 : 1;
                } else if (r1.getResultPath() > r2.getResultPath()) {
                    return direction === SortDirection.Ascending ? 1 : -1;
                } else if (r1.getLine() > r2.getLine()) {
                    return 1;
                } else if (r1.getLine() < r2.getLine()) {
                    return -1;
                } else {
                    return 0;
                }
            case TableHeaders.Line:
                if (r1.getLine() < r2.getLine()) {
                    return direction === SortDirection.Ascending ? -1 : 1;
                } else if (r1.getLine() > r2.getLine()) {
                    return direction === SortDirection.Ascending ? 1 : -1;
                } else {
                    return 0;
                }
            case TableHeaders.Message:
                if (r1.getMessage() < r2.getMessage()) {
                    return direction === SortDirection.Ascending ? -1 : 1;
                } else if (r1.getMessage() > r2.getMessage()) {
                    return direction === SortDirection.Ascending ? 1 : -1;
                } else {
                    return 0;
                }
            case TableHeaders.RuleID:
                return this.compareRule(r1.getRule(), r2.getRule());
        }
    }

    public compareRule(r1: Rule, r2: Rule): number {
        // Sort by level
        if (r1.level < r2.level) {
            return -1;
        } else if (r1.level > r2.level) {
            return 1;
        } else {
            // Sort by tool
            if (r1.toolName < r2.toolName) {
                return -1;
            } else if (r1.toolName > r2.toolName) {
                return 1;
            } else {
                // Sort alphabetically
                if (r1.id < r2.id) {
                    return -1;
                } else if (r1.id > r2.id) {
                    return 1;
                } else {
                    return 0;
                }
            }
        }
    }

    // ====================
    // Filter functions
    // ====================
    public setKeywordFilter(s: string): void {
        this.filters.setKeyword(s);
    }

    public setIncludePathFilter(s: string): void {
        this.filters.setIncludePaths(s);
    }

    public setExcludePathFilter(s: string): void {
        this.filters.setExcludePaths(s);
    }

    public setExcludedRuleIdFilter(s: string): void {
        this.filters.setExcludedRuleIds(s);
    }

    public setExcludedSarifFilesFilter(s: string): void {
        this.filters.setExcludedSarifFiles(s);
    }

    public setLevelErrorFilter(b: boolean): void {
        this.filters.setLevelError(b);
    }

    public setLevelWarningFilter(b: boolean): void {
        this.filters.setLevelWarning(b);
    }

    public setLevelNoteFilter(b: boolean): void {
        this.filters.setLevelNote(b);
    }

    public setLevelNoneFilter(b: boolean): void {
        this.filters.setLevelNone(b);
    }

    public setStatusTodoFilter(b: boolean): void {
        this.filters.setStatusTodo(b);
    }

    public setStatusBugFilter(b: boolean): void {
        this.filters.setStatusBug(b);
    }

    public setStatusFalsePositiveFilter(b: boolean): void {
        this.filters.setStatusFalsePositive(b);
    }

    public setFilters(filterData: FilterData): void {
        this.filters.setFilters(filterData);
    }
}
