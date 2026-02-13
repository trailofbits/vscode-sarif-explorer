export class TabManager {
    private resultsTabButton: HTMLTableElement | undefined = undefined;
    private sarifFilesTabButton: HTMLTableElement | undefined = undefined;

    constructor() {
        this.initTabs();
        this.showSarifFilesTab();
    }

    private initTabs(): void {
        const maybeResultsButton = document.getElementById("resultsTabButton");
        if (!maybeResultsButton) {
            console.error("[SARIF Explorer] results button not found in the document");
            return;
        }
        this.resultsTabButton = maybeResultsButton as HTMLTableElement;
        this.resultsTabButton.onclick = (event): void => {
            this.showTab(event, "resultsTab");
        };

        const maybeSarifFilesTabButton = document.getElementById("sarifFilesTabButton");
        if (!maybeSarifFilesTabButton) {
            console.error("[SARIF Explorer] logs button not found in the document");
            return;
        }
        this.sarifFilesTabButton = maybeSarifFilesTabButton as HTMLTableElement;
        this.sarifFilesTabButton.onclick = (event): void => {
            this.showTab(event, "sarifFilesTab");
        };
    }

    private showTab(event: Event, tabName: string): void {
        if (!event) {
            console.error("[SARIF Explorer] showTab called without a valid event object");
            return;
        }

        // Hide all elements with class="tabContent"
        const tabContent = document.getElementsByClassName("tabContent");
        for (let i = 0; i < tabContent.length; i++) {
            const element = tabContent[i] as HTMLElement;
            // set the tab to be visible if it's the one we want to show
            if (element.id === tabName) {
                // The empty string makes it default to the original display value
                element.classList.remove("hidden_tab");
            } else {
                element.classList.add("hidden_tab");
            }
        }

        // Remove "active" from elements with class="tabLink"
        const tabLinks = document.getElementsByClassName("tabLink");
        for (let i = 0; i < tabLinks.length; i++) {
            tabLinks[i].classList.remove("active");
        }

        // Add "active" to the current tab
        const element = event.target as HTMLElement;
        element.classList.add("active");
    }

    // ====================
    // Public functions
    // ====================
    public showResultsTab(): void {
        if (!this.resultsTabButton) {
            console.error("[SARIF Explorer] results button not found in the document");
            return;
        }
        this.resultsTabButton.click();
    }

    public showSarifFilesTab(): void {
        if (!this.sarifFilesTabButton) {
            console.error("[SARIF Explorer] logs button not found in the document");
            return;
        }
        this.sarifFilesTabButton.click();
    }
}
