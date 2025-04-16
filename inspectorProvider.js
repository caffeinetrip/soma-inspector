const vscode = require('vscode');

class InspectorProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.parameters = [];
        this.moduleInfo = {
            globalConfig: [],
            initParams: [],
            assetFolders: []
        };
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
                case 'parameterValueChange':
                    this._updateParameterValue(message.className, message.parameter, message.value);
                    break;
                case 'jumpToUpdate':
                    vscode.commands.executeCommand('soma-inspector.jumpToUpdate', message.className);
                    break;
                case 'renameProperty':
                    vscode.commands.executeCommand('soma-inspector.renameProperty', message.className, message.propertyName);
                    break;
            }
        });
    }
    
    updateParameters(parameters, moduleInfo = null) {
        this.parameters = parameters;
        if (moduleInfo) {
            this.moduleInfo = moduleInfo;
        }
        
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateParameters',
                parameters: parameters,
                moduleInfo: this.moduleInfo
            });
        }
    }
    
    async _updateParameterValue(className, paramName, newValue) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const document = editor.document;
        const param = this.parameters.find(p => p.className === className && p.name === paramName);
        if (!param) return;
        
        await editor.edit(editBuilder => {
            if (document.languageId === 'python') {
                const valueStart = param.range.start.translate(0, `self.${paramName} = `.length);
                const valueEnd = param.range.end;
                editBuilder.replace(new vscode.Range(valueStart, valueEnd), newValue);
            } else if (document.languageId === 'json') {
                const text = document.getText(param.range);
                const valueStartPos = text.indexOf(':') + 1;
                const valueStart = param.range.start.translate(0, valueStartPos);
                const valueEnd = param.range.end;
                editBuilder.replace(new vscode.Range(valueStart, valueEnd), ` ${newValue}`);
            } else if (document.languageId === 'glsl') {
                const text = document.getText(param.range);
                if (text.includes('=')) {
                    const valueStartPos = text.indexOf('=') + 1;
                    const valueStart = param.range.start.translate(0, valueStartPos);
                    const valueEnd = param.range.end;
                    editBuilder.replace(new vscode.Range(valueStart, valueEnd), ` ${newValue}`);
                } else {
                    editBuilder.insert(param.range.end, ` = ${newValue}`);
                }
            }
        });
        
        param.value = newValue;
    }
    
    _getHtml() {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Soma Inspector</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                
                .soma-inspector {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                
                .inspector-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px;
                }
                
                .tab-container {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 10px;
                }
                
                .tab {
                    padding: 6px 12px;
                    cursor: pointer;
                    background-color: var(--vscode-editor-background);
                    border: none;
                    color: var(--vscode-foreground);
                    opacity: 0.7;
                    font-size: 13px;
                    position: relative;
                }
                
                .tab.active {
                    opacity: 1;
                    font-weight: bold;
                }
                
                .tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    width: 100%;
                    height: 2px;
                    background-color: #2d5e8d;
                }
                
                .tab-content {
                    display: none;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                .main-content {
                    margin-bottom: 50px;
                }
                
                .config-section {
                    margin-bottom: 12px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .config-header {
                    background-color: #2d5e8d;
                    padding: 6px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: white;
                    font-weight: bold;
                }
                
                .config-content {
                    padding: 6px;
                    background-color: var(--vscode-editor-background);
                }
                
                .class-group {
                    margin-bottom: 12px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .class-header {
                    background-color: #4d4d4d;
                    padding: 6px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: white;
                    font-weight: bold;
                }
                
                .method-group {
                    margin-bottom: 8px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .method-header {
                    background-color: #333333;
                    padding: 5px 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: #e0e0e0;
                }
                
                .method-name {
                    font-weight: bold;
                }
                
                .class-name {
                    font-weight: bold;
                    text-transform: uppercase;
                }
                
                .method-content {
                    padding: 6px;
                    background-color: var(--vscode-editor-background);
                }
                
                .parameter-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                    padding: 4px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .parameter-row:hover {
                    background-color: rgba(255, 255, 255, 0.05);
                }
                
                .parameter-name {
                    flex: 1;
                    font-size: 12px;
                    position: relative;
                }
                
                .parameter-input-container {
                    display: flex;
                    align-items: center;
                    flex: 1;
                }
                
                .parameter-input {
                    flex: 1;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 4px 8px;
                    border-radius: 2px;
                    width: 80px;
                    font-size: 12px;
                }
                
                .parameter-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }
                
                .button-group {
                    display: flex;
                    align-items: center;
                }
                
                .reset-button, .rename-button {
                    background-color: transparent;
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    padding: 0 4px;
                    font-size: 14px;
                    opacity: 0.7;
                    margin-left: 4px;
                }
                
                .reset-button:hover, .rename-button:hover {
                    opacity: 1;
                }
                
                .no-parameters {
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    margin: 20px 0;
                    font-size: 13px;
                }
                
                .tooltip {
                    position: relative;
                }
                
                .tooltip .tooltiptext {
                    visibility: hidden;
                    width: 120px;
                    background-color: var(--vscode-editorHoverWidget-background);
                    color: var(--vscode-editorHoverWidget-foreground);
                    text-align: center;
                    border-radius: 6px;
                    padding: 5px;
                    position: absolute;
                    z-index: 1;
                    bottom: 125%;
                    left: 50%;
                    margin-left: -60px;
                    opacity: 0;
                    transition: opacity 0.3s;
                    font-size: 0.8em;
                    pointer-events: none;
                }
                
                .tooltip:hover .tooltiptext {
                    visibility: visible;
                    opacity: 1;
                }
                
                .collapse-icon {
                    font-size: 10px;
                    margin-left: 5px;
                }
                
                .hidden {
                    display: none;
                }
                
                .parameter-type {
                    color: #8c8c8c;
                    font-size: 10px;
                    width: 50px;
                    text-transform: uppercase;
                    text-align: right;
                    margin-right: 6px;
                }
                
                .component-badge {
                    font-size: 9px;
                    background-color: #2d5e8d;
                    color: white;
                    padding: 1px 4px;
                    border-radius: 3px;
                    margin-left: 6px;
                }
                
                .class-type-badge {
                    font-size: 9px;
                    background-color: #8d2d5e;
                    color: white;
                    padding: 1px 4px;
                    border-radius: 3px;
                    margin-left: 6px;
                }
                
                .has-update-badge {
                    font-size: 9px;
                    background-color: #5e8d2d;
                    color: white;
                    padding: 1px 4px;
                    border-radius: 3px;
                    margin-left: 6px;
                    cursor: pointer;
                }
                
                .systems-used {
                    font-size: 9px;
                    color: #a0a0a0;
                    margin-top: 4px;
                    padding-left: 4px;
                }
                
                .system-tag {
                    display: inline-block;
                    background-color: #555555;
                    color: white;
                    padding: 1px 4px;
                    border-radius: 3px;
                    margin-right: 4px;
                    margin-bottom: 4px;
                    font-size: 8px;
                }
                
                .checkbox-input {
                    margin-right: 10px;
                }
                
                .array-value {
                    color: #8db0e0;
                    font-family: monospace;
                    font-size: 11px;
                }
                
                .image-preview {
                    max-width: 100px;
                    max-height: 100px;
                    margin-top: 5px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                }
                
                .update-button {
                    display: block;
                    width: 100%;
                    background-color: #5e8d2d;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 0;
                    margin-top: 20px;
                    cursor: pointer;
                    font-weight: bold;
                    text-align: center;
                }
                
                .update-button:hover {
                    background-color: #4c7324;
                }
                
                .module-section {
                    margin-bottom: 15px;
                }
                
                .module-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    padding-bottom: 4px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #2d5e8d;
                }
                
                .folder-path {
                    display: inline-block;
                    font-size: 11px;
                    background-color: #333;
                    color: #fff;
                    padding: 2px 6px;
                    border-radius: 4px;
                    margin-top: 4px;
                }
            </style>
        </head>
        <body>
            <div class="soma-inspector">
                <div class="tab-container">
                    <div class="tab active" data-tab="config">GLOBAL CONFIG</div>
                    <div class="tab" data-tab="engine">ENGINE</div>
                    <div class="tab" data-tab="assets">ASSETS</div>
                    <div class="tab" data-tab="classes">CLASSES</div>
                </div>
                
                <div class="inspector-content">
                    <div class="tab-content active" id="config-tab">
                        <div id="configContainer">
                            <div class="no-parameters">
                                No configuration parameters found
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="engine-tab">
                        <div id="engineContainer">
                            <div class="no-parameters">
                                No engine parameters found
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="assets-tab">
                        <div id="assetsContainer">
                            <div class="no-parameters">
                                No asset folders found
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="classes-tab">
                        <div id="classesContainer">
                            <div class="no-parameters">
                                No classes found
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                let parameters = [];
                let moduleInfo = {
                    globalConfig: [],
                    initParams: [],
                    assetFolders: []
                };
                
                let collapsedGroups = {
                    configs: false,
                    classes: {},
                    methods: {}
                };
                
                const vscode = acquireVsCodeApi();
                
                document.addEventListener('DOMContentLoaded', function() {
                    addTabEventListeners();
                });
                
                function addTabEventListeners() {
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                            
                            tab.classList.add('active');
                            document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
                        });
                    });
                }
                
                function groupParameters(params) {
                    const groups = {
                        configs: [],
                        classes: {}
                    };
                    
                    params.forEach(param => {
                        if (param.isConfig) {
                            groups.configs.push(param);
                        } else {
                            if (!groups.classes[param.className]) {
                                groups.classes[param.className] = {
                                    methods: {},
                                    type: param.classType || '',
                                    folder: param.folder || '',
                                    usedSystems: param.usedSystems || [],
                                    hasUpdateMethod: param.hasUpdateMethod || false,
                                    imageFolder: param.imageFolder || ''
                                };
                            }
                            
                            if (!groups.classes[param.className].methods[param.method]) {
                                groups.classes[param.className].methods[param.method] = [];
                            }
                            
                            groups.classes[param.className].methods[param.method].push(param);
                        }
                    });
                    
                    return groups;
                }
                
                function renderGlobalConfig() {
                    const container = document.getElementById('configContainer');
                    
                    if (moduleInfo.globalConfig.length === 0) {
                        container.innerHTML = \`
                            <div class="no-parameters">
                                No configuration parameters found
                            </div>
                        \`;
                        return;
                    }
                    
                    let html = '';
                    
                    html += \`
                        <div class="module-section">
                            <div class="module-title">GLOBAL CONSTANTS</div>
                    \`;
                    
                    moduleInfo.globalConfig.forEach(param => {
                        const displayValue = param.type === 'array' 
                            ? \`<span class="array-value">\${param.value}</span>\` 
                            : '';
                            
                        html += \`
                            <div class="parameter-row">
                                <div class="parameter-name tooltip">
                                    \${param.name}
                                    <span class="tooltiptext">Line: \${param.line + 1}</span>
                                </div>
                                <div class="parameter-input-container">
                                    <div class="parameter-type">\${param.type}</div>
                                    \${param.type !== 'array' ? \`
                                    <input type="\${param.type === 'boolean' ? 'checkbox' : param.type === 'int' ? 'number' : 'text'}" 
                                        class="\${param.type === 'boolean' ? 'checkbox-input' : 'parameter-input'}" 
                                        data-class="\${param.className}"
                                        data-param="\${param.name}" 
                                        value="\${param.value}"
                                        \${param.type === 'boolean' && param.value.toLowerCase() === 'true' ? 'checked' : ''} 
                                        step="\${param.type === 'int' ? '1' : '0.1'}"
                                    />
                                    \` : displayValue}
                                    <div class="button-group">
                                        \${param.type !== 'array' ? \`
                                        <button class="reset-button" data-class="\${param.className}" data-param="\${param.name}" data-original="\${param.originalValue}" title="Reset to original value">↺</button>
                                        <button class="rename-button" data-class="\${param.className}" data-param="\${param.name}" title="Rename property">✎</button>
                                        \` : ''}
                                    </div>
                                </div>
                            </div>
                        \`;
                    });
                    
                    html += \`</div>\`;
                    
                    container.innerHTML = html;
                    
                    addParameterEventListeners();
                }
                
                function renderEngineParams() {
                    const container = document.getElementById('engineContainer');
                    
                    if (moduleInfo.initParams.length === 0) {
                        container.innerHTML = \`
                            <div class="no-parameters">
                                No engine parameters found
                            </div>
                        \`;
                        return;
                    }
                    
                    let html = '';
                    
                    html += \`
                        <div class="module-section">
                            <div class="module-title">ENGINE INITIALIZATION</div>
                    \`;
                    
                    moduleInfo.initParams.forEach(param => {
                        const displayValue = param.type === 'array' 
                            ? \`<span class="array-value">\${param.value}</span>\` 
                            : '';
                            
                        html += \`
                            <div class="parameter-row">
                                <div class="parameter-name tooltip">
                                    \${param.name}
                                    <span class="tooltiptext">Line: \${param.line + 1}</span>
                                </div>
                                <div class="parameter-input-container">
                                    <div class="parameter-type">\${param.type}</div>
                                    \${param.type !== 'array' ? \`
                                    <input type="\${param.type === 'boolean' ? 'checkbox' : param.type === 'int' ? 'number' : 'text'}" 
                                        class="\${param.type === 'boolean' ? 'checkbox-input' : 'parameter-input'}" 
                                        data-class="\${param.className}"
                                        data-param="\${param.name}" 
                                        value="\${param.value}"
                                        \${param.type === 'boolean' && param.value.toLowerCase() === 'true' ? 'checked' : ''} 
                                        step="\${param.type === 'int' ? '1' : '0.1'}"
                                    />
                                    \` : displayValue}
                                    <div class="button-group">
                                        \${param.type !== 'array' ? \`
                                        <button class="reset-button" data-class="\${param.className}" data-param="\${param.name}" data-original="\${param.originalValue}" title="Reset to original value">↺</button>
                                        \` : ''}
                                    </div>
                                </div>
                            </div>
                        \`;
                    });
                    
                    html += \`</div>\`;
                    
                    container.innerHTML = html;
                    
                    addParameterEventListeners();
                }
                
                function renderAssetFolders() {
                    const container = document.getElementById('assetsContainer');
                    
                    if (moduleInfo.assetFolders.length === 0) {
                        container.innerHTML = \`
                            <div class="no-parameters">
                                No asset folders found
                            </div>
                        \`;
                        return;
                    }
                    
                    let html = '';
                    
                    html += \`
                        <div class="module-section">
                            <div class="module-title">ASSET FOLDERS</div>
                    \`;
                    
                    moduleInfo.assetFolders.forEach(folder => {
                        html += \`
                            <div class="parameter-row">
                                <div class="parameter-name">
                                    \${folder.path.split('/').pop()}
                                    <div class="folder-path">\${folder.path}</div>
                                </div>
                                <div class="parameter-input-container">
                                    <div class="parameter-type">folder</div>
                                    <div>\${folder.contents.length} files</div>
                                </div>
                            </div>
                        \`;
                    });
                    
                    html += \`</div>\`;
                    
                    container.innerHTML = html;
                }
                
                function renderClasses() {
                    const container = document.getElementById('classesContainer');
                    
                    const groups = groupParameters(parameters);
                    
                    if (Object.keys(groups.classes).length === 0) {
                        container.innerHTML = \`
                            <div class="no-parameters">
                                No classes found
                            </div>
                        \`;
                        return;
                    }
                    
                    let html = '';
                    
                    for (const [className, classInfo] of Object.entries(groups.classes)) {
                        const isClassCollapsed = collapsedGroups.classes[className] || false;
                        
                        html += \`
                            <div class="class-group">
                                <div class="class-header" data-class="\${className}">
                                    <span class="class-name">\${className} 
                                        <span class="component-badge">\${classInfo.folder || 'Component'}</span>
                                        \${classInfo.type ? \`<span class="class-type-badge">\${classInfo.type}</span>\` : ''}
                                    </span>
                                    <span class="collapse-icon">\${isClassCollapsed ? '▶' : '▼'}</span>
                                </div>
                                <div class="class-content \${isClassCollapsed ? 'hidden' : ''}">
                        \`;
                        
                        if (classInfo.usedSystems && classInfo.usedSystems.length > 0) {
                            html += \`<div class="systems-used">Systems: \`;
                            classInfo.usedSystems.forEach(system => {
                                html += \`<span class="system-tag">\${system}</span>\`;
                            });
                            html += \`</div>\`;
                        }
                        
                        if (classInfo.imageFolder) {
                            html += \`
                                <div class="systems-used">
                                    Image folder: <span class="system-tag">\${classInfo.imageFolder}</span>
                                </div>
                            \`;
                        }
                        
                        for (const [methodName, params] of Object.entries(classInfo.methods)) {
                            const isMethodCollapsed = collapsedGroups.methods[\`\${className}.\${methodName}\`] || false;
                            
                            html += \`
                                <div class="method-group">
                                    <div class="method-header" data-class="\${className}" data-method="\${methodName}">
                                        <span class="method-name">\${methodName}()</span>
                                        <span class="collapse-icon">\${isMethodCollapsed ? '▶' : '▼'}</span>
                                    </div>
                                    <div class="method-content \${isMethodCollapsed ? 'hidden' : ''}">
                            \`;
                            
                            params.forEach(param => {
                                const displayName = param.method === 'json' && param.displayName ? param.displayName : param.name;
                                const displayValue = param.type === 'array' 
                                    ? \`<span class="array-value">\${param.value}</span>\` 
                                    : '';
                                
                                html += \`
                                    <div class="parameter-row">
                                        <div class="parameter-name tooltip">
                                            \${displayName}
                                            <span class="tooltiptext">Line: \${param.line + 1}</span>
                                        </div>
                                        <div class="parameter-input-container">
                                            <div class="parameter-type">\${param.type}</div>
                                            \${param.type !== 'array' ? \`
                                            <input type="\${param.type === 'boolean' ? 'checkbox' : param.type === 'int' ? 'number' : 'text'}" 
                                                class="\${param.type === 'boolean' ? 'checkbox-input' : 'parameter-input'}" 
                                                data-class="\${param.className}"
                                                data-param="\${param.name}" 
                                                value="\${param.value}"
                                                \${param.type === 'boolean' && param.value.toLowerCase() === 'true' ? 'checked' : ''} 
                                                step="\${param.type === 'int' ? '1' : '0.1'}"
                                            />
                                            \` : displayValue}
                                            <div class="button-group">
                                                \${param.type !== 'array' ? \`
                                                <button class="reset-button" data-class="\${param.className}" data-param="\${param.name}" data-original="\${param.originalValue}" title="Reset to original value">↺</button>
                                                <button class="rename-button" data-class="\${param.className}" data-param="\${param.name}" title="Rename property">✎</button>
                                                \` : ''}
                                            </div>
                                        </div>
                                    </div>
                                \`;
                            });
                            
                            html += \`
                                    </div>
                                </div>
                            \`;
                        }
                        
                        if (classInfo.hasUpdateMethod) {
                            html += \`
                                <button class="update-button" data-class="\${className}">JUMP TO UPDATE METHOD</button>
                            \`;
                        }
                        
                        html += \`
                                </div>
                            </div>
                        \`;
                    }
                    
                    container.innerHTML = html;
                    
                    addClassEventListeners();
                }
                
                function addParameterEventListeners() {
                    document.querySelectorAll('.parameter-input').forEach(input => {
                        input.addEventListener('change', (e) => {
                            const paramName = e.target.dataset.param;
                                                        const className = e.target.dataset.class;
                                                        const newValue = e.target.value;
                                                        
                                                        vscode.postMessage({
                                                            command: 'parameterValueChange',
                                                            className: className,
                                                            parameter: paramName,
                                                            value: newValue
                                                        });
                                                    });
                                                });
                                                
                                                document.querySelectorAll('.checkbox-input').forEach(input => {
                                                    input.addEventListener('change', (e) => {
                                                        const paramName = e.target.dataset.param;
                                                        const className = e.target.dataset.class;
                                                        const newValue = e.target.checked ? 'True' : 'False';
                                                        
                                                        vscode.postMessage({
                                                            command: 'parameterValueChange',
                                                            className: className,
                                                            parameter: paramName,
                                                            value: newValue
                                                        });
                                                    });
                                                });
                                                
                                                document.querySelectorAll('.reset-button').forEach(button => {
                                                    button.addEventListener('click', (e) => {
                                                        const paramName = e.target.dataset.param;
                                                        const className = e.target.dataset.class;
                                                        const originalValue = e.target.dataset.original;
                                                        
                                                        const input = document.querySelector(\`.parameter-input[data-param="\${paramName}"][data-class="\${className}"], .checkbox-input[data-param="\${paramName}"][data-class="\${className}"]\`);
                                                        if (input) {
                                                            if (input.type === 'checkbox') {
                                                                input.checked = originalValue.toLowerCase() === 'true';
                                                            } else {
                                                                input.value = originalValue;
                                                            }
                                                            
                                                            vscode.postMessage({
                                                                command: 'parameterValueChange',
                                                                className: className,
                                                                parameter: paramName,
                                                                value: originalValue
                                                            });
                                                        }
                                                    });
                                                });
                                                
                                                document.querySelectorAll('.rename-button').forEach(button => {
                                                    button.addEventListener('click', (e) => {
                                                        const paramName = e.target.dataset.param;
                                                        const className = e.target.dataset.class;
                                                        
                                                        vscode.postMessage({
                                                            command: 'renameProperty',
                                                            className: className,
                                                            propertyName: paramName
                                                        });
                                                    });
                                                });
                                            }
                                            
                                            function addClassEventListeners() {
                                                document.querySelectorAll('.class-header').forEach(header => {
                                                    header.addEventListener('click', (e) => {
                                                        const className = e.target.closest('.class-header').dataset.class;
                                                        const content = e.target.closest('.class-group').querySelector('.class-content');
                                                        const icon = e.target.closest('.class-header').querySelector('.collapse-icon');
                                                        
                                                        collapsedGroups.classes[className] = !collapsedGroups.classes[className];
                                                        
                                                        content.classList.toggle('hidden');
                                                        icon.textContent = collapsedGroups.classes[className] ? '▶' : '▼';
                                                    });
                                                });
                                                
                                                document.querySelectorAll('.method-header').forEach(header => {
                                                    header.addEventListener('click', (e) => {
                                                        const className = e.target.closest('.method-header').dataset.class;
                                                        const methodName = e.target.closest('.method-header').dataset.method;
                                                        const groupKey = \`\${className}.\${methodName}\`;
                                                        const content = e.target.closest('.method-group').querySelector('.method-content');
                                                        const icon = e.target.closest('.method-header').querySelector('.collapse-icon');
                                                        
                                                        collapsedGroups.methods[groupKey] = !collapsedGroups.methods[groupKey];
                                                        
                                                        content.classList.toggle('hidden');
                                                        icon.textContent = collapsedGroups.methods[groupKey] ? '▶' : '▼';
                                                        
                                                        e.stopPropagation();
                                                    });
                                                });
                                                
                                                document.querySelectorAll('.update-button').forEach(button => {
                                                    button.addEventListener('click', (e) => {
                                                        const className = e.target.dataset.class;
                                                        
                                                        vscode.postMessage({
                                                            command: 'jumpToUpdate',
                                                            className: className
                                                        });
                                                    });
                                                });
                                                
                                                addParameterEventListeners();
                                            }
                                            
                                            function renderAll() {
                                                renderGlobalConfig();
                                                renderEngineParams();
                                                renderAssetFolders();
                                                renderClasses();
                                                
                                                addTabEventListeners();
                                            }
                                            
                                            window.addEventListener('message', event => {
                                                const message = event.data;
                                                
                                                switch (message.command) {
                                                    case 'updateParameters':
                                                        parameters = message.parameters;
                                                        if (message.moduleInfo) {
                                                            moduleInfo = message.moduleInfo;
                                                        }
                                                        renderAll();
                                                        break;
                                                }
                                            });
                                        </script>
                                    </body>
                                    </html>
                                    `;
                                }
                            }

                            module.exports = InspectorProvider;