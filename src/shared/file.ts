export function normalizePath(path: string, baseFolder: string): string {
    // remove "file://" from the beginning of the path
    if (path.startsWith("file://")) {
        path = path.substring("file://".length);
    }

    // if the file is NOT absolute and a base directory was provided, normalize it relative to the base directory
    if (!path.startsWith("/") && baseFolder !== "") {
        // remove "./" from the beginning of the path
        path = path.replace(/\.\//g, "/");
        path = baseFolder + "/" + path;
    }

    path = path.replace(/\/\//g, "/");
    return path;
}

export function getPathLeaf(path: string): string {
    const parts = path.split("/");
    const len = parts.length;
    if (len === 0) {
        return "";
    } else {
        return parts[len - 1];
    }
}
