//@ts-check
/* eslint-env node */

"use strict";

/* trunk-ignore(eslint/@typescript-eslint/no-var-requires) */
const path = require("path");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const config = {
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: ["ts-loader"],
            },
            {
                test: /\.scss$/i,
                use: ["style-loader", "css-loader", "sass-loader"],
            },
            {
                test: /\.(html)$/i,
                type: "asset/source",
            },
        ],
    },
    devtool: "nosources-source-map",
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
    resolve: {
        extensions: [".ts", ".js", ".scss", ".html"],
    },
    externals: {
        vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
        // modules added here also need to be added in the .vscodeignore file
    },
};

const extensionConfig = Object.assign({}, config, {
    target: "node", // VS Code extensions run in a Node.js-context
    entry: "./src/extension/extension.ts", // the entry point of the extension
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "extension.js",
        libraryTarget: "commonjs2",
    },
});

const webviewConfig = Object.assign({}, config, {
    target: "web", // The Webview runs in web context
    entry: "./src/webviewSrc/main.ts", // the entry point of the webview
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "webview.js",
    },
});

module.exports = [extensionConfig, webviewConfig];
