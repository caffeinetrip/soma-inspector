const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const InspectorProvider = require('./inspectorProvider');
const AssetsProvider = require('./assetsProvider');

function activate(context) {
    const inspectorProvider = new InspectorProvider(context.extensionUri);
    const assetsProvider = new AssetsProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'somaInspectorView', 
            inspectorProvider
        )
    );
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'somaAssetsView',
            assetsProvider
        )
    );
    
    let openPanelCommand = vscode.commands.registerCommand('soma-inspector.openPanel', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            processFile(document, inspectorProvider, assetsProvider);
        }
        vscode.commands.executeCommand('workbench.view.extension.soma-inspector');
    });
    
    let jumpToUpdateCommand = vscode.commands.registerCommand('soma-inspector.jumpToUpdate', async (className) => {
        const files = await vscode.workspace.findFiles('**/*.py');
        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                
                const classMatch = new RegExp(`class\\s+${className}\\s*\\(`, 'g').exec(text);
                if (!classMatch) continue;
                
                const updateMatch = /def\s+update\s*\(\s*self/g.exec(text.slice(classMatch.index));
                if (!updateMatch) continue;
                
                const position = document.positionAt(classMatch.index + updateMatch.index);
                const editor = await vscode.window.showTextDocument(document);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
                return;
            } catch (error) {}
        }
    });
    
    let renamePropertyCommand = vscode.commands.registerCommand('soma-inspector.renameProperty', async (className, propertyName) => {
        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for ${propertyName}`,
            value: propertyName
        });
        
        if (newName && newName !== propertyName) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;
                const text = document.getText();
                
                const regex = new RegExp(`self\\.${propertyName}\\b`, 'g');
                const edits = [];
                
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(match.index + match[0].length);
                    edits.push({
                        range: new vscode.Range(startPos, endPos),
                        newText: `self.${newName}`
                    });
                }
                
                if (edits.length > 0) {
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    edits.forEach(edit => {
                        workspaceEdit.replace(document.uri, edit.range, edit.newText);
                    });
                    await vscode.workspace.applyEdit(workspaceEdit);
                    processFile(document, inspectorProvider, assetsProvider);
                }
            }
        }
    });
    
    context.subscriptions.push(openPanelCommand);
    context.subscriptions.push(jumpToUpdateCommand);
    context.subscriptions.push(renamePropertyCommand);
    
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            processFile(editor.document, inspectorProvider, assetsProvider);
        }
    });
}

function processFile(document, inspectorProvider, assetsProvider) {
    if (document.languageId === 'python') {
        processPythonFile(document, inspectorProvider, assetsProvider);
    } else if (document.languageId === 'json') {
        processJsonFile(document, inspectorProvider);
    } else if (document.languageId === 'glsl') {
        processShaderFile(document, inspectorProvider);
    }
}

function processPythonFile(document, inspectorProvider, assetsProvider) {
    const text = document.getText();
    const parameters = [];
    const assetFolders = {};
    const moduleInfo = {
        globalConfig: [],
        initParams: [],
        assetFolders: []
    };
    
    scanConfigValues(document, text, parameters, moduleInfo);
    scanClassStructure(document, text, parameters);
    scanAssetFolders(document, text, assetFolders, moduleInfo);
    scanImageProperties(document, text, parameters);
    scanInitCalls(document, text, parameters, moduleInfo);
    
    inspectorProvider.updateParameters(parameters, moduleInfo);
    assetsProvider.updateAssetFolders(assetFolders);
}

function processJsonFile(document, inspectorProvider) {
    const text = document.getText();
    const parameters = [];
    
    try {
        const json = JSON.parse(text);
        scanJson('', json, document, parameters);
    } catch (error) {}
    
    inspectorProvider.updateParameters(parameters, {
        globalConfig: parameters,
        initParams: [],
        assetFolders: []
    });
}

function processShaderFile(document, inspectorProvider) {
    const text = document.getText();
    const parameters = [];
    
    const uniformRegex = /uniform\s+(\w+)\s+(\w+)(?:\s*=\s*([0-9.]+))?/g;
    let match;
    
    while ((match = uniformRegex.exec(text)) !== null) {
        const type = match[1];
        const name = match[2];
        const value = match[3] || '0';
        
        if (!type.includes('vec') && !type.includes('mat') && type !== 'sampler2D') {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            parameters.push({
                name: name,
                value: value,
                originalValue: value,
                range: range,
                line: startPos.line,
                method: 'uniform',
                className: 'Shader',
                type: type === 'int' ? 'int' : 'float',
                folder: 'shader',
                isUniform: true
            });
        }
    }
    
    inspectorProvider.updateParameters(parameters, {
        globalConfig: parameters,
        initParams: [],
        assetFolders: []
    });
}

function scanConfigValues(document, text, parameters, moduleInfo) {
    const configRegex = /^([A-Z][A-Z0-9_]+)\s*=\s*(.+)$/gm;
    let match;
    
    while ((match = configRegex.exec(text)) !== null) {
        const name = match[1];
        const value = match[2].trim();
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);
        
        let type = 'string';
        let displayValue = value;
        
        if (value.startsWith('(') || value.startsWith('[')) {
            type = 'array';
        } else if (!isNaN(Number(value))) {
            type = value.includes('.') ? 'float' : 'int';
            displayValue = value;
        } else if (value === 'True' || value === 'False') {
            type = 'boolean';
            displayValue = value;
        }
        
        const configItem = {
            name: name,
            value: displayValue,
            originalValue: displayValue,
            range: range,
            line: startPos.line,
            method: 'config',
            className: 'GlobalConfig',
            type: type,
            folder: path.basename(path.dirname(document.fileName)),
            isConfig: true
        };
        
        parameters.push(configItem);
        moduleInfo.globalConfig.push(configItem);
    }
}

function scanClassStructure(document, text, parameters) {
    const classRegex = /class\s+([a-zA-Z0-9_]+)\s*\(\s*([a-zA-Z0-9_\.]+)\s*\):/g;
    const classes = {};
    
    let match;
    while ((match = classRegex.exec(text)) !== null) {
        const className = match[1];
        const parentClass = match[2];
        const classStart = match.index;
        
        let classType = '';
        if (parentClass.includes('ElementSingleton')) {
            classType = 'Singleton';
        } else if (parentClass.includes('PhysicsEntity')) {
            classType = 'PhysicsEntity';
        } else if (parentClass.includes('Entity')) {
            classType = 'Entity';
        } else if (parentClass.includes('Element')) {
            classType = 'Element';
        } else if (parentClass.includes('PygpenGame')) {
            classType = 'PygpenGame';
        } else if (parentClass.includes('GameScript')) {
            classType = 'Script';
        }
        
        classes[className] = {
            type: classType,
            start: classStart,
            hasUpdateMethod: text.slice(classStart).includes('def update(self') || 
                             text.slice(classStart).includes('def update (self')
        };
        
        const initMatch = /def\s+(?:__init__|init)\s*\(\s*self/g.exec(text.slice(classStart));
        if (initMatch) {
            const initStart = classStart + initMatch.index;
            const initEnd = findMethodEnd(text, initStart);
            const initText = text.slice(initStart, initEnd);
            
            const paramRegex = /self\.([a-zA-Z0-9_]+)\s*=\s*([^#\n]+)/g;
            let paramMatch;
            
            while ((paramMatch = paramRegex.exec(initText)) !== null) {
                const paramName = paramMatch[1];
                const paramValue = paramMatch[2].trim();
                const startPos = document.positionAt(initStart + paramMatch.index);
                const endPos = document.positionAt(initStart + paramMatch.index + paramMatch[0].length);
                const range = new vscode.Range(startPos, endPos);
                
                let type = 'unknown';
                let displayValue = paramValue;
                
                if (paramValue.startsWith('(') || paramValue.startsWith('[')) {
                    type = 'array';
                } else if (!isNaN(Number(paramValue))) {
                    type = paramValue.includes('.') ? 'float' : 'int';
                    displayValue = paramValue;
                } else if (paramValue === 'True' || paramValue === 'False') {
                    type = 'boolean';
                    displayValue = paramValue;
                }
                
                parameters.push({
                    name: paramName,
                    value: displayValue,
                    originalValue: displayValue,
                    range: range,
                    line: startPos.line,
                    method: '__init__',
                    className: className,
                    type: type,
                    folder: path.basename(path.dirname(document.fileName)),
                    classType: classType,
                    hasUpdateMethod: classes[className].hasUpdateMethod
                });
            }
        }
        
        const usedSystems = findUsedSystems(text.slice(classStart), classes[className].hasUpdateMethod);
        if (usedSystems.length > 0) {
            parameters.forEach(param => {
                if (param.className === className) {
                    param.usedSystems = usedSystems;
                }
            });
        }
    }
}

function findMethodEnd(text, methodStart) {
    const lines = text.slice(methodStart).split('\n');
    const indentMatch = lines[0].match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1].length : 0;
    
    let lineCount = 1;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const lineIndentMatch = line.match(/^(\s*)/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[1].length : 0;
        
        if (line.trim() === '' || line.trim().startsWith('#')) {
            lineCount++;
            continue;
        }
        
        if (lineIndent <= baseIndent) {
            break;
        }
        
        lineCount++;
    }
    
    return methodStart + lines.slice(0, lineCount).join('\n').length;
}

function findUsedSystems(classText, hasUpdateMethod) {
    const systemRegex = /self\.e\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
    const systems = new Set();
    
    let match;
    while ((match = systemRegex.exec(classText)) !== null) {
        systems.add(match[1]);
    }
    
    return Array.from(systems);
}

function scanAssetFolders(document, text, assetFolders, moduleInfo) {
    const assetRegex = /load_folder\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*[^)]+)?\)/g;
    let match;
    
    while ((match = assetRegex.exec(text)) !== null) {
        const folderPath = match[1];
        const contents = getAssetFolderContents(folderPath);
        assetFolders[folderPath] = contents;
        
        moduleInfo.assetFolders.push({
            path: folderPath,
            contents: contents
        });
    }
}

function getAssetFolderContents(folderPath) {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const fullPath = path.join(workspaceRoot, folderPath);
        
        if (fs.existsSync(fullPath)) {
            return fs.readdirSync(fullPath).filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext);
            });
        }
    } catch (error) {}
    
    return [];
}

function scanImageProperties(document, text, parameters) {
    const imgPropertyRegex = /@property\s+[\s\S]*?def\s+img\s*\(\s*self\s*\)[\s\S]*?return\s+([^#\n]+)/g;
    
    let match;
    while ((match = imgPropertyRegex.exec(text)) !== null) {
        const returnValue = match[1].trim();
        const className = findClassForPosition(text, document.positionAt(match.index).line);
        
        if (className && returnValue.includes('Assets') && returnValue.includes('images')) {
            const folderMatch = returnValue.match(/images\s*\[\s*['"]([^'"]+)['"]\s*\]/);
            if (folderMatch) {
                const folder = folderMatch[1];
                parameters.forEach(param => {
                    if (param.className === className) {
                        param.imageFolder = folder;
                    }
                });
            }
        }
    }
}

function scanInitCalls(document, text, parameters, moduleInfo) {
    const initCallsRegex = /pp\.init\s*\(\s*([\s\S]*?)\)/g;
    let match;
    
    while ((match = initCallsRegex.exec(text)) !== null) {
        const initParams = match[1];
        const startPos = document.positionAt(match.index);
        
        const className = findClassForPosition(text, startPos.line);
        
        const paramRegex = /([a-zA-Z0-9_]+)\s*=\s*([^,\n]+)/g;
        let paramMatch;
        
        while ((paramMatch = paramRegex.exec(initParams)) !== null) {
            const paramName = paramMatch[1];
            const paramValue = paramMatch[2].trim();
            const paramStartPos = document.positionAt(match.index + paramMatch.index);
            const paramEndPos = document.positionAt(match.index + paramMatch.index + paramMatch[0].length);
            const range = new vscode.Range(paramStartPos, paramEndPos);
            
            const initParam = {
                name: paramName,
                value: paramValue,
                originalValue: paramValue,
                range: range,
                line: document.positionAt(match.index + paramMatch.index).line,
                method: 'init',
                className: className || 'Engine',
                type: paramValue.includes('.') ? 'float' : (isNaN(Number(paramValue)) ? 'string' : 'int'),
                folder: 'Engine',
                isInit: true
            };
            
            parameters.push(initParam);
            moduleInfo.initParams.push(initParam);
        }
    }
}

function findClassForPosition(text, line) {
    const classRegex = /class\s+([a-zA-Z0-9_]+)\s*\(/g;
    const classes = [];
    
    let match;
    while ((match = classRegex.exec(text)) !== null) {
        const className = match[1];
        const classLine = text.substring(0, match.index).split('\n').length - 1;
        classes.push({ name: className, line: classLine });
    }
    
    classes.sort((a, b) => a.line - b.line);
    
    for (let i = 0; i < classes.length; i++) {
        if (classes[i].line <= line && (i === classes.length - 1 || classes[i + 1].line > line)) {
            return classes[i].name;
        }
    }
    
    return null;
}

function scanJson(path, obj, document, parameters) {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'object' && value !== null) {
            scanJson(currentPath, value, document, parameters);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            const regex = new RegExp(`"${key}"\\s*:\\s*${typeof value === 'boolean' ? value : value}`, 'g');
            let match = regex.exec(document.getText());
            
            if (match) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                
                parameters.push({
                    name: currentPath,
                    displayName: key,
                    value: String(value),
                    originalValue: String(value),
                    range: new vscode.Range(startPos, endPos),
                    line: startPos.line,
                    method: path || 'root',
                    className: path.split('.')[0] || 'JSON',
                    type: typeof value === 'boolean' ? 'boolean' : Number.isInteger(value) ? 'int' : 'float',
                    folder: 'json'
                });
            }
        }
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};