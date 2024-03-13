import {
    ExtensionToWebviewMsgTypes,
    OpenSarifFileResponse,
    SetSarifFileBaseFolder,
} from "../shared/webviewMessageTypes";
import { ResultsTableWidget } from "./result/resultsTableWidget";
import { SarifFileListWidget } from "./sarifFile/sarifFileListWidget";
import { TabManager } from "./tabs";

import "./style.scss";
import { initResizablePanels } from "./resizablePanels/resizablePanels";
import { SarifFile } from "./sarifFile/sarifFile";
import { apiFailedToParseSarifFile, apiWebviewIsReady } from "./extensionApi";

type State = {
    tabManager: TabManager;

    resultsTableWidget: ResultsTableWidget;
    sarifFileListWidget: SarifFileListWidget;
};

let state: State;

function init() {
    const _resultsTableWidget = new ResultsTableWidget();
    state = {
        tabManager: new TabManager(),
        resultsTableWidget: _resultsTableWidget,
        sarifFileListWidget: new SarifFileListWidget(_resultsTableWidget),
    };

    // Add an event listener to receive messages from the extension
    window.addEventListener("message", (event) => {
        const message: ExtensionToWebviewMsgTypes = event.data;
        handleWebviewMessage(message);
    });

    // Tell the extension that the webview is ready
    apiWebviewIsReady();

    initResizablePanels();

    window.addEventListener("click", (event) => {
        state.resultsTableWidget.globalOnClick(event);
    });
}

// Init everything when the DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    init();
});

function handleWebviewMessage(msg: ExtensionToWebviewMsgTypes) {
    // console.debug("[Webview] Received a '" + msg.command + "'");
    // console.debug("[Webview] Received message from extension:", msg);

    switch (msg.command) {
        case "webviewIsReadyResponse": {
            state.resultsTableWidget.updateVSCodeConfig(msg.vscodeConfig);
            state.resultsTableWidget.resultsTable.setFilters(msg.filterData);
            state.resultsTableWidget.updateResultFiltersHTMLElements();
            break;
        }
        case "openSarifFileResponse": {
            handleOpenSarifFileResponseMsg(msg);
            break;
        }
        case "setSarifFileBaseFolder": {
            handleSetSarifFileBaseFolderMsg(msg);
            break;
        }
        case "updateVSCodeConfig": {
            state.resultsTableWidget.updateVSCodeConfig(msg.vscodeConfig);
            break;
        }
        default: {
            console.error("[SARIF Explorer] Unknown message received from extension:", msg);
        }
    }
}

function handleOpenSarifFileResponseMsg(msg: OpenSarifFileResponse) {
    // If we already have the SARIF file open, reload it
    if (state.sarifFileListWidget.hasSarifFile(msg.sarifFilePath)) {
        state.sarifFileListWidget.removeSarifFileWithPath(msg.sarifFilePath);
    }

    // Parse the SARIF file contents into results
    try {
        const sarifFile = new SarifFile(
            msg.sarifFilePath,
            msg.sarifFileContents,
            msg.resultNotes,
            msg.hiddenRules,
            msg.baseFolder,
        );
        state.sarifFileListWidget.addSarifFile(sarifFile);
    } catch (error) {
        apiFailedToParseSarifFile(msg.sarifFilePath, String(error));
        return;
    }

    state.tabManager.showResultsTab();
}

function handleSetSarifFileBaseFolderMsg(msg: SetSarifFileBaseFolder) {
    const sarifFile = state.sarifFileListWidget.getSarifFileListData().getSarifFile(msg.sarifFilePath);
    if (!sarifFile) {
        console.error(
            "[SARIF Explorer] handleSetSarifFileBaseFolderMsg: Could not find SARIF file for path:",
            msg.sarifFilePath,
        );
        return;
    }

    if (sarifFile.getResultsBaseFolder() !== msg.resultsBaseFolder) {
        sarifFile.setResultsBaseFolder(msg.resultsBaseFolder);
        state.sarifFileListWidget
            .getSarifFileDetailsWidget()
            .updateBaseFolder(msg.sarifFilePath, msg.resultsBaseFolder);
        // Update the result's detailed view
        state.resultsTableWidget.render();
    }
}
