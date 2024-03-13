import { Result } from "./result";
import { ResultLevel, ResultStatus } from "../../shared/resultTypes";
import { FilterData } from "../../shared/filterData";
import { apiSetFilterData } from "../extensionApi";

export class ResultsTableFilters {
    private d: FilterData = {
        keyword: "",
        includePaths: [],
        excludePaths: [],
        excludeRuleIds: [],
        excludeSarifFiles: [],

        includeLevelError: true,
        includeLevelWarning: true,
        includeLevelNote: true,
        includeLevelNone: true,

        includeStatusTodo: true,
        includeStatusFalsePositive: true,
        includeStatusBug: true,
    };

    // Same information as above but as a set
    private includePathsAsSet: Set<string> = new Set();
    private excludePathsAsSet: Set<string> = new Set();
    private excludeRuleIdsAsSet: Set<string> = new Set();
    private excludeSarifFilesAsSet: Set<string> = new Set();

    // The main filtering function
    // Returns true if the result should be included in the table
    public filter(result: Result): boolean {
        return (
            this.filterByRuleIds(result) &&
            this.filterByKeyword(result) &&
            this.filterByIncludePath(result) &&
            this.filterByExcludePath(result) &&
            this.filterBySarifFiles(result) &&
            this.filterByLevel(result) &&
            this.filterByStatus(result)
        );
    }

    public filterByKeyword(result: Result): boolean {
        if (this.d.keyword === "") {
            return true;
        }

        // Checks are case insensitive
        const keyword = this.d.keyword.toLowerCase();
        const rule = result.getRule();
        return (
            result.getResultPath().toLowerCase().includes(keyword) ||
            result.getLine().toString().includes(keyword) ||
            result.getMessage().toLowerCase().includes(keyword) ||
            result.getAssociatedSarifFile().getTool().name.toLowerCase().includes(keyword) ||
            result.getComment().toLowerCase().includes(keyword) ||
            rule.id.toLowerCase().includes(keyword) ||
            rule.name.toLowerCase().includes(keyword) ||
            rule.shortDescription.toLowerCase().includes(keyword) ||
            rule.fullDescription.toLowerCase().includes(keyword) ||
            rule.help.toLowerCase().includes(keyword) ||
            rule.helpURI.toLowerCase().includes(keyword) ||
            rule.toolName.toLowerCase().includes(keyword)
        );
    }

    public filterByIncludePath(result: Result): boolean {
        if (this.includePathsAsSet.size === 0) {
            return true;
        }

        const resPath = result.getResultNormalizedPath();
        for (const p of this.includePathsAsSet) {
            if (resPath.includes(p)) {
                return true;
            }
        }
        return false;
    }

    public filterByExcludePath(result: Result): boolean {
        if (this.excludePathsAsSet.size === 0) {
            return true;
        }

        const resPath = result.getResultNormalizedPath();
        for (const p of this.excludePathsAsSet) {
            if (resPath.includes(p)) {
                return false;
            }
        }
        return true;
    }

    public filterByRuleIds(result: Result): boolean {
        if (this.excludeRuleIdsAsSet.size === 0) {
            return true;
        }

        const ruleId = result.getRuleId();
        return !this.excludeRuleIdsAsSet.has(ruleId);
    }

    public filterBySarifFiles(result: Result): boolean {
        if (this.excludeSarifFilesAsSet.size === 0) {
            return true;
        }

        const sarifFilePath = result.getAssociatedSarifPath();
        return !this.excludeSarifFilesAsSet.has(sarifFilePath);
    }

    public filterByLevel(result: Result): boolean {
        const level = result.getLevel();
        if (this.d.includeLevelError && level === ResultLevel.error) {
            return true;
        }
        if (this.d.includeLevelWarning && level === ResultLevel.warning) {
            return true;
        }
        if (this.d.includeLevelNote && level === ResultLevel.note) {
            return true;
        }
        if (this.d.includeLevelNone && level === ResultLevel.none) {
            return true;
        }
        return false;
    }

    public filterByStatus(result: Result): boolean {
        const status = result.getStatus();
        if (this.d.includeStatusTodo && status === ResultStatus.Todo) {
            return true;
        }
        if (this.d.includeStatusBug && status === ResultStatus.Bug) {
            return true;
        }
        if (this.d.includeStatusFalsePositive && status === ResultStatus.FalsePositive) {
            return true;
        }
        return false;
    }

    public getFilterData(): FilterData {
        return this.d;
    }

    public setKeyword(s: string) {
        this.d.keyword = s;
        apiSetFilterData(this.d);
    }

    public setIncludePaths(s: string) {
        this.includePathsAsSet = splitStringInParts(s);
        this.d.includePaths = Array.from(this.includePathsAsSet);
        apiSetFilterData(this.d);
    }

    public setExcludePaths(s: string) {
        this.excludePathsAsSet = splitStringInParts(s);
        this.d.excludePaths = Array.from(this.excludePathsAsSet);
        apiSetFilterData(this.d);
    }

    public setExcludedRuleIds(s: string) {
        this.excludeRuleIdsAsSet = splitStringInParts(s);
        this.d.excludeRuleIds = Array.from(this.excludeRuleIdsAsSet);
        apiSetFilterData(this.d);
    }

    public setExcludedSarifFiles(s: string) {
        this.excludeSarifFilesAsSet = splitStringInParts(s);
        this.d.excludeSarifFiles = Array.from(this.excludeSarifFilesAsSet);
        apiSetFilterData(this.d);
    }

    public setLevelError(b: boolean) {
        this.d.includeLevelError = b;
        apiSetFilterData(this.d);
    }

    public setLevelWarning(b: boolean) {
        this.d.includeLevelWarning = b;
        apiSetFilterData(this.d);
    }

    public setLevelNote(b: boolean) {
        this.d.includeLevelNote = b;
        apiSetFilterData(this.d);
    }

    public setLevelNone(b: boolean) {
        this.d.includeLevelNone = b;
        apiSetFilterData(this.d);
    }

    public setStatusTodo(b: boolean) {
        this.d.includeStatusTodo = b;
        apiSetFilterData(this.d);
    }

    public setStatusBug(b: boolean) {
        this.d.includeStatusBug = b;
        apiSetFilterData(this.d);
    }

    public setStatusFalsePositive(b: boolean) {
        this.d.includeStatusFalsePositive = b;
        apiSetFilterData(this.d);
    }

    public setFilters(filterData: FilterData) {
        this.d = filterData;
        this.includePathsAsSet = new Set(filterData.includePaths);
        this.excludePathsAsSet = new Set(filterData.excludePaths);
        this.excludeRuleIdsAsSet = new Set(filterData.excludeRuleIds);
        this.excludeSarifFilesAsSet = new Set(filterData.excludeSarifFiles);

        // Unnecessary to call `apiSetFilterData` here because this function is only called on initial setup
    }
}

export function splitStringInParts(s: string): Set<string> {
    return new Set(
        s
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    ); // Removes empty strings
}

export function setToStringInParts(s: Set<string>): string {
    return Array.from(s).join(", ");
}
