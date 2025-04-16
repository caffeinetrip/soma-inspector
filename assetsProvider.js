const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class AssetsProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.assetFolders = {};
        this._view = null;
    }
    
    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        
        webviewView.webview.html = this._getHtml();
        
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'openFile':
                    this._openAssetFile(message.folderPath, message.fileName);
                    break;
            }
        });
    }
    
    updateAssetFolders(folders) {
        this.assetFolders = folders;
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateAssetFolders',
                folders: this.assetFolders
            });
        }
    }
    
    async _openAssetFile(folderPath, fileName) {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const fullPath = path.join(workspaceRoot, folderPath, fileName);
            const uri = vscode.Uri.file(fullPath);
            
            const fileExtension = path.extname(fileName).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(fileExtension)) {
                vscode.commands.executeCommand('vscode.open', uri);
            } else {
                const document = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(document);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
        }
    }
    
    _getHtml() {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Soma Assets</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                
                .assets-container {
                    padding: 10px;
                }
                
                .asset-folder {
                    margin-bottom: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .folder-header {
                    background-color: #4d4d4d;
                    padding: 6px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: white;
                    font-weight: bold;
                }
                
                .folder-content {
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                }
                
                .assets-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                    gap: 10px;
                    margin-top: 10px;
                }
                
                .asset-preview {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: hidden;
                    cursor: pointer;
                    background-color: rgba(0, 0, 0, 0.2);
                    padding: 5px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                
                .asset-preview:hover {
                    border-color: var(--vscode-focusBorder);
                    background-color: rgba(45, 94, 141, 0.2);
                }
                
                .preview-image {
                    width: 100%;
                    height: 60px;
                    object-fit: contain;
                    display: block;
                }
                
                .asset-name {
                    font-size: 10px;
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    width: 100%;
                    margin-top: 5px;
                }
                
                .import-info {
                    font-size: 11px;
                    padding: 8px;
                    background-color: #2d2d2d;
                    margin-top: 8px;
                    border-radius: 4px;
                    font-family: monospace;
                }
                
                .no-assets {
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    margin: 20px 0;
                    font-size: 13px;
                }
                
                .collapse-icon {
                    font-size: 10px;
                    margin-left: 5px;
                }
                
                .hidden {
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="assets-container" id="assetsContainer">
                <div class="no-assets">
                    No asset folders detected
                </div>
            </div>
            
            <script>
                let assetFolders = {};
                let collapsedFolders = {};
                
                const vscode = acquireVsCodeApi();
                
                function renderAssetFolders() {
                    const container = document.getElementById('assetsContainer');
                    
                    if (Object.keys(assetFolders).length === 0) {
                        container.innerHTML = \`
                            <div class="no-assets">
                                No asset folders detected
                            </div>
                        \`;
                        return;
                    }
                    
                    let html = '';
                    
                    for (const [folderPath, files] of Object.entries(assetFolders)) {
                        const isCollapsed = collapsedFolders[folderPath] || false;
                        const folderName = folderPath.split('/').pop();
                        
                        html += \`
                            <div class="asset-folder">
                                <div class="folder-header" data-folder="\${folderPath}">
                                    <span>\${folderName}</span>
                                    <span class="collapse-icon">\${isCollapsed ? '▶' : '▼'}</span>
                                </div>
                                <div class="folder-content \${isCollapsed ? 'hidden' : ''}">
                                    <div class="import-info">
                                        Images in this folder are accessed via: <br/>
                                        <code>self.e['Assets'].images['\${folderName}'][image_name]</code>
                                    </div>
                        \`;
                        
                        if (files && files.length > 0) {
                            html += \`<div class="assets-grid">\`;
                            
                            files.forEach(file => {
                                html += \`
                                    <div class="asset-preview" data-folder="\${folderPath}" data-file="\${file}">
                                        <div class="preview-image" style="background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2260%22><rect width=%22100%22 height=%2260%22 fill=%22%232d2d2d%22 /><text x=%2250%22 y=%2230%22 font-family=%22Arial%22 font-size=%2210%22 text-anchor=%22middle%22 fill=%22white%22>Image Preview</text></svg>');"></div>
                                        <div class="asset-name">\${file}</div>
                                    </div>
                                \`;
                            });
                            
                            html += \`</div>\`;
                        } else {
                            html += \`
                                <div class="no-assets">
                                    No images found in this folder
                                </div>
                            \`;
                        }
                        
                        html += \`
                                </div>
                            </div>
                        \`;
                    }
                    
                    container.innerHTML = html;
                    
                    document.querySelectorAll('.folder-header').forEach(header => {
                        header.addEventListener('click', (e) => {
                            const folder = e.target.closest('.folder-header').dataset.folder;
                            const content = e.target.closest('.asset-folder').querySelector('.folder-content');
                            const icon = e.target.closest('.folder-header').querySelector('.collapse-icon');
                            
                            collapsedFolders[folder] = !collapsedFolders[folder];
                            
                            content.classList.toggle('hidden');
                            icon.textContent = collapsedFolders[folder] ? '▶' : '▼';
                        });
                    });
                    
                    document.querySelectorAll('.asset-preview').forEach(preview => {
                        preview.addEventListener('click', (e) => {
                            const folder = e.currentTarget.dataset.folder;
                            const file = e.currentTarget.dataset.file;
                            
                            vscode.postMessage({
                                command: 'openFile',
                                folderPath: folder,
                                fileName: file
                            });
                        });
                    });
                }
                
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'updateAssetFolders':
                            assetFolders = message.folders;
                            renderAssetFolders();
                            break;
                    }
                });
            </script>
        </body>
        </html>
        `;
    }
}

module.exports = AssetsProvider;