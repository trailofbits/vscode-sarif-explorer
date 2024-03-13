# Specification of the .sarifexplorer file

Example:

```json
{
  "resultIdToNotes": {
    "0|23": {
      "status": 1,
      "comment": "This is a False Positive because..."
    },
    "0|24": {
      "status": 2,
      "comment": "This is a bug because attacker-controlled data can reach it in [this] way"
    }
  },
  "hiddenRules": [
    "python.lang.security.audit.insecure-file-permissions.insecure-file-permissions"
  ]
}
```

The `.sarifexplorer` format is a `.json` file with two objects:
  - The `resultIdToNotes` dictionary
  - The `hiddenRules` array

The file is stored well formatted to ease diffing and merging of conflicts in git.


## resultIdToNotes

A dictionary of result id to metadata about a result, which includes the results status (`Bug`, `False Positive`, or `Todo`) and any text note that a user may have added. If no modifications were made to a result, the result will have no entry in this dictionary.

A result id consists of the concatenation of:
  - the result's `runIndex` (usually just `0`)
  - the result's index within the run

CAREFUL: If the SARIF file is updated after you triage some results (e.g., by re-running the tool with more rules) these indexes may become desynchronized. If updating a SARIF file while keeping the notes consistent is a feature that users want, we'll need to implement this functionality in the future. In the past, we've tried to store the result's fingerprint when present (instead of the result's index within the run). This didn't work because many tools emitted multiple results with the same fingerprint, which resulted in these results having the same id.


## hiddenRules

The `hiddenRules` array contains a list of rules that are hidden in the UI.
