/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Result } from "../result/result";
import {
    ResultNotes,
    ResultLocation,
    DEFAULT_NOTES_COMMENT,
    DEFAULT_NOTES_STATUS,
    ResultLevel,
    Rule,
    DataFlowElement,
    LabeledLocation,
} from "../../shared/resultTypes";
import { apiSetResultsBaseFolder } from "../extensionApi";

export type Tool = {
    name: string;
    informationUri: string;
    rules: Map<string, Rule>;
};

export type Run = {
    runNumber: number;
    tool: Tool;
    results: Result[];
};

export class SarifFile {
    // The path to the SARIF file
    private sarifFilePath: string;
    // The runs in the SARIF file
    private runs: Run[] = [];
    // The path containing the files that were tested by the static analysis tool (same for all runs)
    private resultsBaseFolder: string;

    constructor(sarifFilePath: string, sarifFileContents: string, resultNotes: ResultNotes, hiddenRules: string[], resultsBaseFolder: string) {
        this.sarifFilePath = sarifFilePath;
        this.resultsBaseFolder = resultsBaseFolder;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sarifJson: any;
        try {
            sarifJson = JSON.parse(sarifFileContents);
        } catch (e) {
            throw new Error("Cannot parse the JSON contents of the SARIF file: " + String(e));
        }

        // Parse the SARIF file
        for (const [runIndex, rawRun] of sarifJson.runs.entries()) {
            let run: Run;

            try {
                // Some SARIF files specify a potential base folder (for the system that generated the SARIF file). Use that by default
                if (resultsBaseFolder === "" && rawRun.originalUriBaseIds) {
                    if (rawRun.originalUriBaseIds["SRCROOT"]) {
                        this.resultsBaseFolder = rawRun.originalUriBaseIds["SRCROOT"].uri;
                    } else if (rawRun.originalUriBaseIds["srcroot"]) {
                        this.resultsBaseFolder = rawRun.originalUriBaseIds["srcroot"].uri;
                    }
                }

                run = {
                    runNumber: runIndex,
                    tool: this.parseTool(rawRun.tool, hiddenRules, runIndex),
                    results: this.parseResults(rawRun.results, runIndex, resultNotes),
                };
            } catch (e) {
                console.error((e as Error).stack);
                throw new Error("Parsing failed: " + String(e));
            }

            for (const result of run.results) {
                const rule = run.tool.rules.get(result.getRuleId());

                if (rule === undefined) {
                    // If the rule is not specified, we just create one
                    const rule: Rule = {
                        id: result.getRuleId(),
                        name: result.getRuleId(),
                        level: result.getLevel(),
                        shortDescription: "",
                        fullDescription: "",
                        help: "",
                        helpURI: "",
                        toolName: run.tool.name,
                        isHidden: hiddenRules.includes(result.getRuleId()),
                    };
                    run.tool.rules.set(rule.id, rule);
                } else if (rule.level === ResultLevel.default) {
                    // Set the level of the rule
                    rule.level = result.getLevel();
                } else {
                    result.setLevel(rule.level);
                }
            }

            this.runs.push(run);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseLocation(loc: any): ResultLocation {
        if (loc.physicalLocation === undefined) {
            console.warn(
                "[SARIF Explorer] Failed to parse the 'location' of a result because it does include the 'physicalLocation' property. The full 'location' value is: " +
                    JSON.stringify(loc),
            );

            return {
                path: "unknown_path",
                region: {
                    startLine: 1,
                    startColumn: 1,
                    endLine: 10000,
                    endColumn: 10000,
                },
            };
        }

        let path: string;
        if (loc.physicalLocation.artifactLocation !== undefined) {
            path = loc.physicalLocation.artifactLocation?.uri || "";
        } else if (loc.physicalLocation.address !== undefined) {
            // Very basic support for address-based locations https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10541143
            // Since SARIF Explorer works mostly with source files, we just have very minimal support for this
            const address: number = loc.physicalLocation.address?.absoluteAddress || loc.physicalLocation.address?.relativeAddress || -1;
            path = "0x" + address.toString(16);
        } else {
            path = "";
        }

        return {
            path: path,
            region: {
                startLine: loc.physicalLocation?.region?.startLine || 1,
                startColumn: loc.physicalLocation?.region?.startColumn || 1,
                endLine: loc.physicalLocation?.region?.endLine || loc.physicalLocation?.region?.startLine || 10000,
                endColumn: loc.physicalLocation?.region?.endColumn || loc.physicalLocation?.region?.startColumn + 1 || 10000,
            },
        };
    }

    // Parse a list of json results and return a list of Result objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseResults(dataResults: any[], runIndex: number, resultNotes: ResultNotes): Result[] {
        const parsedResults: Result[] = [];
        const resultIdSet: Set<string> = new Set();
        for (let i = 0; i < dataResults.length; i++) {
            const result = dataResults[i];

            // Parse all the locations associated with the result
            const locations: ResultLocation[] = [];
            if (result.locations) {
                for (const loc of result.locations) {
                    const parsedLocation: ResultLocation = this.parseLocation(loc);
                    locations.push(parsedLocation);
                }
            }

            // See: https://docs.oasis-open.org/sarif/sarif/v2.1.0/csprd01/sarif-v2.1.0-csprd01.html#_Toc10541098
            // Parse the related locations that links in description may point to
            const relatedLocations: Map<number, LabeledLocation> = new Map();
            if (result.relatedLocations) {
                for (const loc of result.relatedLocations) {
                    let index = loc.id ?? -1;
                    const parsedLocation: ResultLocation = this.parseLocation(loc);
                    // For negative indexes, i.e., for locations without an id, we use the first available negative index
                    while (index < 0 && relatedLocations.has(index)) {
                        index--;
                    }
                    const message = loc.message?.text || "";
                    relatedLocations.set(index, {
                        location: parsedLocation,
                        label: message,
                    });
                }
            }

            // Parse the potential data flow associated with the result
            const dataFlow: DataFlowElement[] = [];
            if (result.codeFlows && result.codeFlows.length > 0) {
                // NOTE: Only parsing one codeFlow. The SARIF spec allows more than one to exist.
                const codeFlow = result.codeFlows[0];

                // NOTE: Only parsing one threadFlow. The SARIF spec allows more than one to exist
                if (codeFlow.threadFlows && codeFlow.threadFlows.length > 0) {
                    const threadFlow = codeFlow.threadFlows[0];
                    for (const codeLocation of threadFlow.locations) {
                        const loc = codeLocation.location;
                        const parsedLocation: ResultLocation = this.parseLocation(loc);
                        dataFlow.push({
                            message: loc.message?.text || "<location>",
                            location: parsedLocation,
                        });
                    }
                }
            }

            // Validate that the level is an expected value
            let resLevel: ResultLevel = ResultLevel.none;
            if (result.level) {
                result.level = result.level.toLowerCase();
                if (Object.values(ResultLevel).includes(result.level)) {
                    // Go from the string value to the enum value
                    resLevel = ResultLevel[result.level as keyof typeof ResultLevel];
                } else {
                    console.warn(
                        "[SARIF Explorer] Unexpected result level '" + result.level + "' found in SARIF file " + this.sarifFilePath + ". Using default level.",
                    );
                }
            }

            // Commented out because we stopped using fingerprints. We might use them in the future.
            // let fingerprints = new Map();
            // for (const k in result.fingerprints) {
            //     fingerprints.set(k, result.fingerprints[k]);
            // }
            // for (const k in result.partialFingerprints) {
            //     fingerprints.set(k, result.partialFingerprints[k]);
            // }
            // // Sort the fingerprints alphabetically
            // fingerprints = new Map([...fingerprints.entries()].sort());

            // // Convert the fingerprints to a string in the format "key1:value1;key2:value2;..."
            // let fingerprintsString = "";
            // for (const [k, v] of fingerprints) {
            //     fingerprintsString += k + ":" + v + ";";
            // }
            // // Remove the trailing ';'
            // if (fingerprintsString.length > 0) {
            //     fingerprintsString = fingerprintsString.substring(0, fingerprintsString.length - 1);
            // }

            // A result should NEVER have a duplicate resultId.
            const resultId = this.computeResultId(runIndex, i);
            if (resultIdSet.has(resultId)) {
                console.warn("[SARIF Explorer] The result id '" + resultId + "' is duplicated in " + this.sarifFilePath);
            }
            resultIdSet.add(resultId);

            const ruleId = this.computeRuleId(runIndex, result.ruleId);

            const status = resultNotes[resultId]?.status || DEFAULT_NOTES_STATUS;
            const comment = resultNotes[resultId]?.comment || DEFAULT_NOTES_COMMENT;
            const parsedResult: Result = new Result(
                resultId,
                this,
                runIndex,
                resLevel,
                ruleId,
                result.message.text,
                locations,
                relatedLocations,
                dataFlow,
                status,
                comment,
            );
            parsedResults.push(parsedResult);
        }

        return parsedResults;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseTool(tool: any, hiddenRules: string[], runIndex: number): Tool {
        const toolDriver = tool.driver ?? tool;

        // A toolComponent object SHALL contain a property named name whose value is (...) the name of the tool component.
        const toolName: string = toolDriver.name;

        // A toolComponent object MAY contain a property named informationUri | downloadUri
        const informationUri: string = toolDriver.informationUri || toolDriver.downloadUri || "";

        // A toolComponent object MAY contain a property named rules
        const rules: Map<string, Rule> = new Map();
        if (toolDriver.rules) {
            for (const rule of toolDriver.rules) {
                // A reportingDescriptor object SHALL contain a property named id
                const ruleId = this.computeRuleId(runIndex, rule.id);

                // A reportingDescriptor object MAY contain a property named name
                const ruleName = rule.name || rule.id || "";

                // Either the shortDescription property (§3.49.9) or the fullDescription property (§3.49.10) or both SHOULD be present.
                const shortDescription = rule.shortDescription?.text || "";
                const fullDescription = rule.fullDescription?.text || "";

                // A reportingDescriptor object MAY contain a property named help whose value is a localizable multiformatMessageString object (§3.12, §3.12.2) which provides the primary documentation for the reporting item.
                const help = rule.help?.text || "";
                const helpURI = rule.helpUri || "";

                // This level may be updated according to the level of a result with this rule
                const level: ResultLevel = this.parseLevel(rule.defaultConfiguration?.level || "");
                const ruleObject: Rule = {
                    id: ruleId,
                    name: ruleName,
                    level: level,
                    shortDescription: shortDescription,
                    fullDescription: fullDescription,
                    help: help,
                    helpURI: helpURI,
                    toolName: toolName,
                    isHidden: hiddenRules.includes(ruleId),
                };
                rules.set(ruleId, ruleObject);
            }
        }

        return {
            name: toolName,
            informationUri: informationUri,
            rules: rules,
        };
    }

    private parseLevel(level: string): ResultLevel {
        level = level.toLowerCase();
        if (Object.values(ResultLevel).includes(level)) {
            // Go from the string value to the enum value
            return ResultLevel[level as keyof typeof ResultLevel];
        } else {
            console.warn("[SARIF Explorer] Unexpected result level '" + level + "' found in SARIF file " + this.sarifFilePath);

            return ResultLevel.default;
        }
    }

    // The result id is used when fetching notes (i.e., comment and status) from the .sarifexplorer file.
    // Using runIndex+resultIndex is sufficient when the .sarif file is not modified; however, if the .sarif file is
    // modified, the result id COULD be different in the new file.
    // To avoid this, we TRIED to use a results's fingerprint (if they exist) to uniquely identify a result without
    // relying on the index. However, some SARIF files (e.g., produced by CodeQL) have non-unique fingerprints for
    // different results. For this reason we still use runIndex+resultIndex.
    private computeResultId(runIndex: number, resultIndex: number): string {
        return runIndex + "|" + resultIndex.toString();
    }

    // We use this to uniquely identify a rule in a run. If we wanted to merge the results with an identical rule id
    // in the same run, we could always return the origRuleId here.
    private computeRuleId(runIndex: number, origRuleId: string): string {
        if (runIndex === 0) {
            return origRuleId;
        } else {
            return origRuleId + "(run " + runIndex + ")";
        }
    }
    // ====================
    // Public methods
    // ====================
    public getResultsBaseFolder(): string {
        return this.resultsBaseFolder;
    }

    public setResultsBaseFolder(resultsBaseFolder: string): void {
        this.resultsBaseFolder = resultsBaseFolder;
        apiSetResultsBaseFolder(this.getSarifFilePath(), resultsBaseFolder);
    }

    public getSarifFilePath(): string {
        return this.sarifFilePath;
    }

    public getRunCount(): number {
        return this.runs.length;
    }

    public getRunResults(runIndex: number): Result[] {
        return this.runs[runIndex].results;
    }

    public getRunTool(runIndex: number): Tool {
        return this.runs[runIndex].tool;
    }

    public getRunRule(id: string, runIndex: number): Rule | undefined {
        return this.runs[runIndex].tool.rules.get(id);
    }

    public getRunRules(runIndex: number): Map<string, Rule> {
        return this.runs[runIndex].tool.rules;
    }

    public getAllResults(): Result[] {
        const res: Result[] = [];
        for (const run of this.runs) {
            res.push(...run.results);
        }
        return res;
    }
}
