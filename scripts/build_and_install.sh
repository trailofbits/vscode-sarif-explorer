#!/bin/bash

# Build the extension (you might need to run `npm install` first)
npm run vscode:package

# Rename the extension to sarif-explorer.vsix
rm sarif-explorer.vsix
mv sarif-explorer-*.vsix sarif-explorer.vsix

# Install the extension
code --install-extension sarif-explorer.vsix
