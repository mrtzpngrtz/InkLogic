// UIManager.js - Handles DOM interactions
const { ipcRenderer } = require('electron');

class UIManager {
    constructor() {
        this.elements = {
            connectBtn: document.getElementById('connectBtn'),
            clearBtn: document.getElementById('clearBtn'),
            statusSpan: document.getElementById('status'),
            responsePreview: document.getElementById('response-preview'),
            canvas: document.getElementById('penCanvas'),
            ctx: document.getElementById('penCanvas').getContext('2d'),
            apiKeyInput: document.getElementById('apiKey'),
            modelSelect: document.getElementById('modelSelect'),
            textPromptInput: document.getElementById('prompt'),
            imagePromptInput: document.getElementById('imagePrompt'),
            sendBtn: document.getElementById('sendBtn'),
            genImageBtn: document.getElementById('genImageBtn'),
            defineBoxBtn: document.getElementById('defineBoxBtn'),
            defineImageBoxBtn: document.getElementById('defineImageBoxBtn'),
            responseArea: document.getElementById('response-area'),
            generatedImage: document.getElementById('generated-image'),
            debugInfo: document.getElementById('debug-info'),
            checkboxOverlay: document.getElementById('checkbox-overlay'),
            imageTriggerOverlay: document.getElementById('image-trigger-overlay'),
            placeholderText: document.getElementById('placeholder-text'),
            clearOutputBtn: document.getElementById('clearOutputBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettingsBtn: document.getElementById('closeSettingsBtn'),
            devicePicker: null // Dynamically created
        };

        this.callbacks = {
            onConnect: null,
            onClear: null,
            onSendText: null,
            onSendImage: null,
            onSettingsChange: null
        };

        this.initListeners();
    }

    initListeners() {
        // Toolbar actions
        this.elements.connectBtn.addEventListener('click', () => {
            if(this.callbacks.onConnect) this.callbacks.onConnect();
        });

        this.elements.clearBtn.addEventListener('click', () => {
            if(this.callbacks.onClear) this.callbacks.onClear();
        });

        this.elements.sendBtn.addEventListener('click', () => {
            if(this.callbacks.onSendText) this.callbacks.onSendText();
        });

        this.elements.genImageBtn.addEventListener('click', () => {
            if(this.callbacks.onSendImage) this.callbacks.onSendImage();
        });

        this.elements.clearOutputBtn.addEventListener('click', () => {
            this.clearOutput();
        });

        // Settings Modal
        this.elements.settingsBtn.addEventListener('click', () => {
            this.elements.settingsModal.classList.remove('hidden');
        });

        this.elements.closeSettingsBtn.addEventListener('click', () => {
            this.elements.settingsModal.classList.add('hidden');
        });

        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.elements.settingsModal.classList.add('hidden');
            }
        });

        // Inputs
        this.elements.apiKeyInput.addEventListener('input', () => {
            if(this.callbacks.onSettingsChange) this.callbacks.onSettingsChange('apiKey', this.elements.apiKeyInput.value);
        });

        this.elements.modelSelect.addEventListener('change', () => {
            if(this.callbacks.onSettingsChange) this.callbacks.onSettingsChange('model', this.elements.modelSelect.value);
        });

        this.elements.textPromptInput.addEventListener('input', () => {
            if(this.callbacks.onSettingsChange) this.callbacks.onSettingsChange('textPrompt', this.elements.textPromptInput.value);
        });

        this.elements.imagePromptInput.addEventListener('input', () => {
            if(this.callbacks.onSettingsChange) this.callbacks.onSettingsChange('imagePrompt', this.elements.imagePromptInput.value);
        });

        // IPC
        ipcRenderer.on('bluetooth-device-list', (event, deviceList) => {
            this.showDevicePicker(deviceList);
        });
    }

    // State Updates
    updateStatus(message) {
        this.elements.statusSpan.innerText = message;
    }

    updateConnectionState(isConnected, buttonText = "Connect") {
        this.elements.connectBtn.innerText = buttonText;
        this.elements.connectBtn.disabled = isConnected && buttonText === "Connecting...";
    }

    updateDebugInfo(info) {
        this.elements.debugInfo.innerText = info;
    }

    // UI Feedback
    showProcessing(mode) {
        this.elements.placeholderText.style.display = 'none';
        this.elements.generatedImage.style.display = 'none';
        this.elements.responseArea.style.display = 'block';
        this.elements.responseArea.innerText = "Thinking...";
        
        const prompt = mode === 'image' ? this.elements.imagePromptInput.value : this.elements.textPromptInput.value;
        this.elements.responsePreview.innerText = `Sending: ${prompt}`;
        this.elements.responseArea.innerText = `[${mode.toUpperCase()}] Sending Prompt:\n"${prompt}"\n\nThinking...`;
    }

    showResult(mode, data) {
        if (mode === 'image') {
            this.elements.generatedImage.src = `data:image/png;base64,${data}`; // Assuming raw data passed? Or handled by service
            // Actually service handles file saving, we might need to load from file or just show raw if returned
            // For now let's assume the service returns the object with url
            if(data.url) {
                this.elements.generatedImage.src = data.url; 
            }
            this.elements.generatedImage.style.display = 'block';
            this.elements.responseArea.style.display = 'none';
            this.updateStatus("Image generated!");
        } else {
            this.elements.responseArea.innerText = data.content || data;
            this.updateStatus("Response received!");
        }
    }

    showError(message) {
        this.elements.responseArea.innerText = "Error: " + message;
        this.updateStatus("Error");
    }

    clearOutput() {
        this.elements.generatedImage.style.display = 'none';
        this.elements.placeholderText.style.display = 'block';
        this.elements.responseArea.style.display = 'none';
    }

    // Canvas
    getCanvas() {
        return this.elements.canvas;
    }

    getContext() {
        return this.elements.ctx;
    }

    redraw(strokeHistory, currentStroke, paperSize, mapToScreenFn) {
        const ctx = this.elements.ctx;
        ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        
        // Border
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333333';
        const topLeft = mapToScreenFn(paperSize.Xmin, paperSize.Ymin);
        const bottomRight = mapToScreenFn(paperSize.Xmax, paperSize.Ymax);
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        
        const draw = (stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            stroke.points.forEach((dot, index) => {
                const screen = mapToScreenFn(dot.x, dot.y);
                if (index === 0) ctx.moveTo(screen.x, screen.y);
                else ctx.lineTo(screen.x, screen.y);
            });
            ctx.stroke();
        };

        strokeHistory.forEach(draw);
        if (currentStroke) draw(currentStroke);
    }

    // Overlays
    updateOverlays(mapToScreenFn, regions, states) {
        this.updateOverlayElement(this.elements.checkboxOverlay, regions.text, states.definingText, "Text", mapToScreenFn);
        this.updateOverlayElement(this.elements.imageTriggerOverlay, regions.image, states.definingImage, "Image", mapToScreenFn);
    }

    updateOverlayElement(element, region, isDefining, label, mapToScreenFn) {
        if (!region) {
            element.style.display = 'none';
            return;
        }

        const coords = mapToScreenFn(region.xMin, region.yMin);
        const coordsMax = mapToScreenFn(region.xMax, region.yMax);
        
        const left = Math.min(coords.x, coordsMax.x);
        const top = Math.min(coords.y, coordsMax.y);
        const width = Math.abs(coordsMax.x - coords.x);
        const height = Math.abs(coordsMax.y - coords.y);
        
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.display = 'block';
        
        const labelDiv = element.querySelector('div');
        if (isDefining) {
            element.style.borderColor = '#ff0000';
            labelDiv.innerText = "Draw Here";
            labelDiv.style.background = 'rgba(255, 0, 0, 0.2)';
        } else {
            element.style.borderColor = label === 'Text' ? '#00ff00' : '#0088ff';
            labelDiv.innerText = label;
            labelDiv.style.background = label === 'Text' ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 136, 255, 0.2)';
        }
    }

    flashOverlay(type) {
        const el = type === 'text' ? this.elements.checkboxOverlay : this.elements.imageTriggerOverlay;
        if (el) {
            const div = el.querySelector('div');
            const originalBg = div.style.background;
            div.style.background = 'rgba(255, 255, 255, 0.5)';
            setTimeout(() => {
                div.style.background = originalBg;
            }, 500);
        }
    }

    // Device Picker
    showDevicePicker(devices) {
        let picker = document.getElementById('device-picker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'device-picker';
            document.body.appendChild(picker);
        }

        picker.innerHTML = '<h3>Select a Device</h3>';
        if (devices.length === 0) {
            picker.innerHTML += '<p>No devices found.</p>';
            this.appendCancelBtn(picker);
            return;
        }

        const list = document.createElement('ul');
        devices.forEach(device => {
            const item = document.createElement('li');
            item.innerText = device.deviceName || `Unknown (${device.deviceId})`;
            item.onclick = () => {
                ipcRenderer.send('bluetooth-device-selected', device.deviceId);
                picker.remove();
            };
            list.appendChild(item);
        });
        picker.appendChild(list);
        this.appendCancelBtn(picker);
    }

    appendCancelBtn(picker) {
        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.onclick = () => {
            ipcRenderer.send('bluetooth-device-selected', '');
            picker.remove();
        };
        picker.appendChild(cancelBtn);
    }

    // Settings Population
    loadSettings(settings) {
        if(settings.apiKey) this.elements.apiKeyInput.value = settings.apiKey;
        if(settings.model) this.elements.modelSelect.value = settings.model;
        if(settings.textPrompt) this.elements.textPromptInput.value = settings.textPrompt;
        if(settings.imagePrompt) this.elements.imagePromptInput.value = settings.imagePrompt;
    }
}

module.exports = UIManager;
