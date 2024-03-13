export type FilterData = {
    keyword: string;
    includePaths: string[];
    excludePaths: string[];
    excludeRuleIds: string[];
    excludeSarifFiles: string[];

    includeLevelError: boolean;
    includeLevelWarning: boolean;
    includeLevelNote: boolean;
    includeLevelNone: boolean;

    includeStatusTodo: boolean;
    includeStatusFalsePositive: boolean;
    includeStatusBug: boolean;
};
