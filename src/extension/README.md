# Extension source code

This folder contains the extension's source code. It includes code that:
  - [Registers VSCode commands](./extension.ts)
  - [Creates and communicates with the Webview](./sarifExplorerWebview.ts)
  - Performs operations on behalf of the Webview: [opening a SARIF file](./operations/openSarifFile.ts), [opening a code region in VSCode](./operations/openCodeRegion.ts), and [persisting data about the SARIF file triage](./operations/handleSarifNotes.ts)

This code is compiled with webpack and outputted to `dist/extension.js` (configured in [webpack.config.js](../../webpack.config.js)).
