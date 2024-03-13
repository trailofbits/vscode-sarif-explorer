# Webview source code

This folder contains the Webview source code. Some of its files and folders are:
  - The [main.ts](./main.ts) file that holds global state and communication with the extension.
  - The [main.html](./main.html) file that includes the HTML code which is the base of the Webview UI. Widgets files ([resultsTableWidget.ts](./result/resultsTableWidget.ts), [resultDetailsWidget.ts](./result/resultDetailsWidget.ts), [sarifFileListWidget.ts](./sarifFile/sarifFileListWidget.ts), and [sarifFileDetailsWidget.ts](./sarifFile/sarifFileDetailsWidget.ts)) use Javascript to further modify the HTML after loading.
  - The [style.scss](./style.scss) file that has the Webview's css code.
  - The [tabs.ts](./tabs.ts) file that manages switching between the results and SARIF files tab.
  - The [resizablePanels.ts](./resizablePanels/resizablePanels.ts) file that handles resizing the table and details panels in both tabs.
  - The [result](./result/) folder that includes all code that draws and holds state for the results tab.
  - The [sarifFile](./sarifFile/) folder includes all code that draws and holds state for the SARIF files tab.

This code is compiled with webpack and outputted to `dist/webview.js` (configured in [webpack.config.js](../../webpack.config.js)).
