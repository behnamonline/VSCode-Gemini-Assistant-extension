import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Gemini AI Assistant extension is now active!');

    const helloWorldCommand = vscode.commands.registerCommand('gemini-assistant.helloWorld', () => {
        vscode.window.showInformationMessage('Gemini AI Assistant is ready to help!');
    });

    const webviewProvider = new GeminiAssistantProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('geminiAssistantView', webviewProvider)
    );
    context.subscriptions.push(helloWorldCommand);
}

export function deactivate() { }

class GeminiAssistantProvider implements vscode.WebviewViewProvider {
    private abortController: AbortController | null = null;
    private isTypingCancelled = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true
        };

        const savedApiKey = this._context.globalState.get<string>('apiKey', '');
        const savedModel = this._context.globalState.get<string>('selectedModel', 'gemini-2.0-flash');
        const savedSpeed = this._context.globalState.get<number>('typingSpeed', 10);
        const savedModelsList = this._context.globalState.get<string[]>('cachedModels', [
            'gemini-3.5-flash-lite',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ]);

        webviewView.webview.html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
        body { 
            padding: 10px; 
            color: var(--vscode-foreground); 
            font-family: var(--vscode-font-family);
            display: flex; 
            flex-direction: column; 
            gap: 12px; 
        }

        .tab-header {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 5px;
        }
        .tab-btn {
            flex: 1;
            padding: 6px 12px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            font-family: inherit;
        }
        .tab-btn.active {
            border-bottom-color: var(--vscode-panelTitle-activeBorder);
            color: var(--vscode-panelTitle-activeForeground);
            font-weight: bold;
        }

        .tab-content {
            display: none;
            flex-direction: column;
            gap: 10px;
        }
        .tab-content.active {
            display: flex;
        }

        textarea, input[type="text"], input[type="number"], select { 
            width: 100%; 
            box-sizing: border-box; 
            padding: 6px 8px;
            background: var(--vscode-input-background); 
            color: var(--vscode-input-foreground); 
            border: 1px solid var(--vscode-input-border); 
            border-radius: 3px;
            outline: none;
        }

        textarea {
            height: 85px;
            resize: vertical;
        }

        .btn-group {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        button.action-btn { 
            flex: 1;
            padding: 8px 6px; 
            border: none; 
            cursor: pointer; 
            font-weight: bold;
            border-radius: 3px;
            transition: all 0.2s ease;
            color: #ffffff;
            font-size: 11px;
            min-width: 70px;
        }

        #writeCodeBtn {
            background-color: #007acc;
        }
        #writeCodeBtn:hover {
            background-color: #005a9e;
        }

        #askQuestionBtn {
            background-color: #28a745;
        }
        #askQuestionBtn:hover {
            background-color: #1e7e34;
        }

        #stopBtn {
            background-color: #dc3545;
        }
        #stopBtn:hover {
            background-color: #bd2130;
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        @keyframes pulseGlow {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.02); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }

        button.loading {
            animation: pulseGlow 1.5s infinite ease-in-out;
        }

        .field-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        label {
            font-size: 12px;
            opacity: 0.9;
        }

        #responseContainer {
            display: block;
            margin-top: 8px;
        }

        #responseBox {
            background: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.15));
            border-right: 3px solid #28a745;
            padding: 8px;
            border-radius: 3px;
            white-space: pre-wrap;
            font-size: 12px;
            min-height: 40px;
            max-height: 250px;
            overflow-y: auto;
            word-break: break-word;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <div class="tab-header">
        <button class="tab-btn active" id="mainTabBtn">اصلی</button>
        <button class="tab-btn" id="settingsTabBtn">تنظیمات</button>
    </div>

    <!-- تب اصلی -->
    <div id="mainTabContent" class="tab-content active">
        <div class="field-group">
            <label for="userPrompt">پیام یا درخواست شما:</label>
            <textarea id="userPrompt" placeholder="سوال خود را بپرسید یا مشخص کنید چه کدی تولید شود..."></textarea>
        </div>
        
        <div class="btn-group">
            <button id="writeCodeBtn" class="action-btn">کد بنویس</button>
            <button id="askQuestionBtn" class="action-btn">سوال بپرس</button>
            <button id="stopBtn" class="action-btn">بس کن 🛑</button>
        </div>

        <div id="responseContainer">
            <label style="display: block; margin-bottom: 4px;">پاسخ مدل:</label>
            <div id="responseBox">آماده دریافت پیام...</div>
        </div>
    </div>

    <!-- تب تنظیمات -->
    <div id="settingsTabContent" class="tab-content">
        <div class="field-group">
            <label for="apiKey">Gemini API Key:</label>
            <input type="text" id="apiKey" value="${savedApiKey}" placeholder="کلید API را وارد کنید...">
        </div>

        <div class="field-group">
            <label for="modelSelect">انتخاب مدل Gemini:</label>
            <div style="display: flex; gap: 4px;">
                <select id="modelSelect" style="flex: 1;">
                    ${savedModelsList.map(modelName => `<option value="${modelName}" ${modelName === savedModel ? 'selected' : ''}>${modelName}</option>`).join('')}
                </select>
                <button id="fetchModelsBtn" class="action-btn" style="background: #6c757d; width: auto; padding: 0 8px;" title="دریافت مدل‌ها از API">🔄</button>
            </div>
        </div>

        <div class="field-group">
            <label for="speed">سرعت تایپ (تأخیر به میلی‌ثانیه):</label>
            <input type="number" id="speed" value="${savedSpeed}" min="1">
        </div>

        <button id="saveSettingsBtn" class="action-btn" style="background-color: #007acc;">ذخیره تنظیمات</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        const mainTabBtn = document.getElementById('mainTabBtn');
        const settingsTabBtn = document.getElementById('settingsTabBtn');
        const mainTabContent = document.getElementById('mainTabContent');
        const settingsTabContent = document.getElementById('settingsTabContent');

        mainTabBtn.addEventListener('click', () => {
            mainTabBtn.classList.add('active');
            settingsTabBtn.classList.remove('active');
            mainTabContent.classList.add('active');
            settingsTabContent.classList.remove('active');
        });

        settingsTabBtn.addEventListener('click', () => {
            settingsTabBtn.classList.add('active');
            mainTabBtn.classList.remove('active');
            settingsTabContent.classList.add('active');
            mainTabContent.classList.remove('active');
        });

        const writeCodeBtn = document.getElementById('writeCodeBtn');
        const askQuestionBtn = document.getElementById('askQuestionBtn');
        const stopBtn = document.getElementById('stopBtn');
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        const fetchModelsBtn = document.getElementById('fetchModelsBtn');
        
        const userPrompt = document.getElementById('userPrompt');
        const apiKeyInput = document.getElementById('apiKey');
        const modelSelect = document.getElementById('modelSelect');
        const speedInput = document.getElementById('speed');
        const responseBox = document.getElementById('responseBox');

        let isProcessing = false;
        let typingInterval = null;

        saveSettingsBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveSettings',
                apiKey: apiKeyInput.value.trim(),
                selectedModel: modelSelect.value,
                speed: parseInt(speedInput.value) || 10
            });
        });

        fetchModelsBtn.addEventListener('click', () => {
            if (!apiKeyInput.value.trim()) {
                alert('لطفاً ابتدا API Key را وارد کنید.');
                return;
            }
            fetchModelsBtn.innerText = '⏳';
            vscode.postMessage({
                command: 'fetchModels',
                apiKey: apiKeyInput.value.trim()
            });
        });

        writeCodeBtn.addEventListener('click', () => {
            if (isProcessing) return;
            if (!userPrompt.value.trim()) {
                alert('لطفاً دستور خود را وارد کنید.');
                return;
            }

            setLoadingState(writeCodeBtn, true, 'در حال تولید...');
            vscode.postMessage({
                command: 'writeCode',
                prompt: userPrompt.value,
                apiKey: apiKeyInput.value.trim(),
                model: modelSelect.value,
                speed: parseInt(speedInput.value) || 10
            });
        });

        askQuestionBtn.addEventListener('click', () => {
            if (isProcessing) return;
            if (!userPrompt.value.trim()) {
                alert('لطفاً سوال خود را وارد کنید.');
                return;
            }

            if (typingInterval) {
                clearInterval(typingInterval);
                typingInterval = null;
            }

            responseBox.innerText = 'در حال دریافت پاسخ از سرور...';
            setLoadingState(askQuestionBtn, true, 'در حال پاسخ...');

            vscode.postMessage({
                command: 'askQuestion',
                prompt: userPrompt.value,
                apiKey: apiKeyInput.value.trim(),
                model: modelSelect.value,
                speed: parseInt(speedInput.value) || 10
            });
        });

        stopBtn.addEventListener('click', () => {
            if (typingInterval) {
                clearInterval(typingInterval);
                typingInterval = null;
            }
            vscode.postMessage({ command: 'stopProcess' });
            setLoadingState(null, false);
        });

        function setLoadingState(activeBtn, loading, text) {
            isProcessing = loading;
            if (loading) {
                activeBtn.classList.add('loading');
                writeCodeBtn.disabled = true;
                askQuestionBtn.disabled = true;
                activeBtn.innerText = text;
            } else {
                writeCodeBtn.classList.remove('loading');
                askQuestionBtn.classList.remove('loading');
                writeCodeBtn.disabled = false;
                askQuestionBtn.disabled = false;
                writeCodeBtn.innerText = 'کد بنویس';
                askQuestionBtn.innerText = 'سوال بپرس';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.command === 'finished') {
                setLoadingState(null, false);
            } 
            else if (message.command === 'modelsFetched') {
                fetchModelsBtn.innerText = '🔄';
                modelSelect.innerHTML = '';
                message.models.forEach(modelName => {
                    const opt = document.createElement('option');
                    opt.value = modelName;
                    opt.textContent = modelName;
                    if (modelName === message.selectedModel) opt.selected = true;
                    modelSelect.appendChild(opt);
                });
            }
            else if (message.command === 'typeAnswerText') {
                if (typingInterval) {
                    clearInterval(typingInterval);
                    typingInterval = null;
                }
                typeTextAnimation(responseBox, message.text || 'پاسخ خالی است.', message.speed);
            }
        });

        function typeTextAnimation(element, text, speed) {
            element.innerText = '';
            let index = 0;

            if (!text) {
                element.innerText = 'پاسخی دریافت نشد.';
                return;
            }

            typingInterval = setInterval(() => {
                if (index < text.length) {
                    element.innerText += text.charAt(index);
                    index++;
                    element.scrollTop = element.scrollHeight;
                } else {
                    clearInterval(typingInterval);
                    typingInterval = null;
                }
            }, Math.max(parseInt(speed) || 10, 5));
        }
    </script>
</body>
</html>`;

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.command === 'saveSettings') {
                await this._context.globalState.update('apiKey', data.apiKey);
                await this._context.globalState.update('selectedModel', data.selectedModel);
                await this._context.globalState.update('typingSpeed', data.speed);
                vscode.window.showInformationMessage('تنظیمات با موفقیت ذخیره شد.');
            } 
            else if (data.command === 'fetchModels') {
                await this.fetchModelsList(data.apiKey, webviewView);
            }
            else if (data.command === 'stopProcess') {
                this.isTypingCancelled = true;
                if (this.abortController) {
                    this.abortController.abort();
                    this.abortController = null;
                }
                vscode.window.showWarningMessage('عملیات متوقف شد.');
            }
            else if (data.command === 'writeCode') {
                this.isTypingCancelled = false;
                this.abortController = new AbortController();
                try {
                    await this.handleWriteCodeRequest(data);
                } finally {
                    webviewView.webview.postMessage({ command: 'finished' });
                }
            }
            else if (data.command === 'askQuestion') {
                this.isTypingCancelled = false;
                this.abortController = new AbortController();
                try {
                    await this.handleAskQuestionRequest(data, webviewView);
                } finally {
                    webviewView.webview.postMessage({ command: 'finished' });
                }
            }
        });
    }

    private async fetchModelsList(apiKey: string, webviewView: vscode.WebviewView) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`خطا با کد status: ${response.status}`);
            }

            const data: any = await response.json();
            if (data?.models && Array.isArray(data.models)) {
                const modelNames = data.models
                    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                    .map((m: any) => m.name.replace('models/', ''));

                if (modelNames.length > 0) {
                    await this._context.globalState.update('cachedModels', modelNames);
                    const selectedModel = this._context.globalState.get<string>('selectedModel', modelNames[0]);
                    
                    webviewView.webview.postMessage({ 
                        command: 'modelsFetched', 
                        models: modelNames, 
                        selectedModel 
                    });
                    vscode.window.showInformationMessage(`تعداد ${modelNames.length} مدل با موفقیت دریافت و به‌روزرسانی شد.`);
                    return;
                }
            }
            vscode.window.showWarningMessage('هیچ مدلی دریافت نشد.');
        } catch (error: any) {
            vscode.window.showErrorMessage(`خطا در دریافت لیست مدل‌ها: ${error.message}`);
        }
    }

    private async handleWriteCodeRequest(data: { prompt: string, apiKey: string, model: string, speed: number }) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('لطفاً ابتدا یک فایل را در ادیتور باز کنید!');
            return;
        }

        const apiKey = data.apiKey || this._context.globalState.get<string>('apiKey', '');
        if (!apiKey) {
            vscode.window.showErrorMessage('لطفاً ابتدا API Key را در تب تنظیمات وارد کنید!');
            return;
        }

        const selectedModel = data.model || this._context.globalState.get<string>('selectedModel', 'gemini-2.0-flash');
        const document = activeEditor.document;
        const currentFileCode = document.getText();
        const fileExtension = document.fileName.split('.').pop() || 'txt';

        const fullPrompt = `You are an expert code generator.
File extension: .${fileExtension}
Current file content:
\`\`\`
${currentFileCode}
\`\`\`

User instructions: ${data.prompt}

CRITICAL REQUIREMENT: Return ONLY the pure raw executable code. Do NOT wrap the response in markdown backticks (like \`\`\`code\`\`\`), do NOT include explanations, introduction, or text formatting. Just raw output code.`;

        const responseText = await this.callGeminiApi(fullPrompt, selectedModel, apiKey);
        if (responseText && !this.isTypingCancelled) {
            const cleanCode = responseText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
            await this.typeIntoActiveEditor(cleanCode, data.speed);
        }
    }

    private async handleAskQuestionRequest(data: { prompt: string, apiKey: string, model: string, speed: number }, webviewView: vscode.WebviewView) {
        const activeEditor = vscode.window.activeTextEditor;
        const apiKey = data.apiKey || this._context.globalState.get<string>('apiKey', '');
        
        if (!apiKey) {
            vscode.window.showErrorMessage('لطفاً ابتدا API Key را در تب تنظیمات وارد کنید!');
            webviewView.webview.postMessage({
                command: 'typeAnswerText',
                text: '❌ خطا: API Key ست نشده است.',
                speed: data.speed
            });
            return;
        }

        const selectedModel = data.model || this._context.globalState.get<string>('selectedModel', 'gemini-2.0-flash');
        
        let currentFileCode = '';
        let fileExtension = 'txt';

        if (activeEditor) {
            currentFileCode = activeEditor.document.getText();
            fileExtension = activeEditor.document.fileName.split('.').pop() || 'txt';
        }

        const fullPrompt = `You are a helpful software engineering assistant.
File extension: .${fileExtension}
Current code in editor:
\`\`\`
${currentFileCode}
\`\`\`

User question: ${data.prompt}

CRITICAL RULES FOR YOUR RESPONSE:
1. Do NOT write full code blocks or long code implementations.
2. Provide explanatory textual guidance, concepts, advice, or short snippets (maximum 3-5 lines of code) only when absolutely necessary for demonstration.
3. Keep the answer concise and helpful.`;

        const responseText = await this.callGeminiApi(fullPrompt, selectedModel, apiKey);
        
        if (responseText && !this.isTypingCancelled) {
            webviewView.webview.postMessage({
                command: 'typeAnswerText',
                text: responseText,
                speed: data.speed
            });
        } else if (!this.isTypingCancelled) {
            webviewView.webview.postMessage({
                command: 'typeAnswerText',
                text: '❌ خطا: یا پاسخی دریافت نشد یا کلید API یا نام مدل اشتباه است.',
                speed: data.speed
            });
        }
    }

    private async callGeminiApi(prompt: string, model: string, apiKey: string): Promise<string | null> {
        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(geminiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                }),
                signal: this.abortController?.signal
            });

            if (!response.ok) {
                const errData: any = await response.json().catch(() => ({}));
                const errMsg = errData?.error?.message || `خطای سرور: ${response.status}`;
                vscode.window.showErrorMessage(`Gemini API Error: ${errMsg}`);
                return `خطا در دریافت پاسخ: ${errMsg}`;
            }

            const resData: any = await response.json();
            
            const candidates = resData?.candidates;
            if (candidates && candidates.length > 0) {
                const parts = candidates[0]?.content?.parts;
                if (parts && parts.length > 0) {
                    return parts.map((part: any) => part.text).join('');
                }
            }

            return null;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('درخواست توسط کاربر لغو شد.');
                return null;
            }
            vscode.window.showErrorMessage(`خطا در ارتباط با API: ${error.message}`);
            return `خطا: ${error.message}`;
        }
    }

    private async typeIntoActiveEditor(newText: string, speed: number) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const document = activeEditor.document;

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        await activeEditor.edit(editBuilder => {
            editBuilder.delete(fullRange);
        });

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < newText.length; i++) {
            if (this.isTypingCancelled) {
                break;
            }

            const char = newText[i];
            
            const lastLine = activeEditor.document.lineCount - 1;
            const lastChar = activeEditor.document.lineAt(lastLine).range.end;

            await activeEditor.edit(editBuilder => {
                editBuilder.insert(lastChar, char);
            });

            await sleep(speed);
        }

        if (!this.isTypingCancelled) {
            vscode.window.showInformationMessage('تولید و تایپ کد با موفقیت به پایان رسید!');
        }
    }
}