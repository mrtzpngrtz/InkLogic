// Patch for .nproj files
if (require.extensions) {
    require.extensions['.nproj'] = function (module, filename) {
        module.exports = filename;
    };
}

const PenManager = require('./src/services/PenManager');
const GeminiService = require('./src/services/GeminiService');
const StorageManager = require('./src/services/StorageManager');
const UIManager = require('./src/ui/UIManager');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');

// --- Initialization ---
const outputDir = path.join(__dirname, 'generated_images');
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

// Instantiate Managers
const penManager = new PenManager();
const geminiService = new GeminiService(outputDir);
const storageManager = new StorageManager(__dirname);
const uiManager = new UIManager();

// --- Configuration & Persistence ---
const triggerRegion = storageManager.getJSON('triggerRegion', { xMin: 50, xMax: 60, yMin: 80, yMax: 88 });
const imageTriggerRegion = storageManager.getJSON('imageTriggerRegion', { xMin: 40, xMax: 50, yMin: 80, yMax: 88 });

// Load UI Settings
const savedSettings = {
    apiKey: storageManager.get('geminiApiKey', ''),
    model: storageManager.get('geminiModel', 'gemini-3-flash-preview'),
    textPrompt: storageManager.get('geminiTextPrompt', ''),
    imagePrompt: storageManager.get('geminiImagePrompt', '')
};
uiManager.loadSettings(savedSettings);
geminiService.setApiKey(savedSettings.apiKey);
geminiService.setModel(savedSettings.model);

// --- Preview Server ---
const history = storageManager.loadHistory();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'preview')));
app.use('/images', express.static(outputDir));

io.on('connection', (socket) => {
    console.log('Preview client connected');
    socket.emit('history', history); 

    socket.on('delete_item', (index) => {
        if (index >= 0 && index < history.length) {
            history.splice(index, 1);
            storageManager.saveHistory(history);
            io.emit('history', history);
        }
    });
});

server.listen(3000, () => {
    console.log('Preview server running on http://localhost:3000');
});

// --- State ---
let isDefiningBox = false; 
let isDefiningImageBox = false;
let lastTriggerTime = 0;
const TRIGGER_COOLDOWN = 2000;

// --- Event Binding ---

// UI -> Logic
uiManager.callbacks.onConnect = async () => {
    try {
        uiManager.updateConnectionState(true, "Connecting...");
        await penManager.connect();
    } catch (e) {
        uiManager.updateConnectionState(false, "Connect Pen");
    }
};

uiManager.callbacks.onClear = () => {
    penManager.clearCanvas();
};

uiManager.callbacks.onSendText = () => processGemini('text');
uiManager.callbacks.onSendImage = () => processGemini('image');

uiManager.callbacks.onSettingsChange = (key, value) => {
    if (key === 'apiKey') {
        storageManager.set('geminiApiKey', value);
        geminiService.setApiKey(value);
    } else if (key === 'model') {
        storageManager.set('geminiModel', value);
        geminiService.setModel(value);
    } else if (key === 'textPrompt') {
        storageManager.set('geminiTextPrompt', value);
    } else if (key === 'imagePrompt') {
        storageManager.set('geminiImagePrompt', value);
    }
};

// Pen -> UI/Logic
penManager.onRedraw = () => {
    uiManager.redraw(
        penManager.strokeHistory, 
        penManager.currentStroke, 
        penManager.paperSize,
        penManager.mapToScreen.bind(penManager)
    );
};

penManager.onStatusChange = (msg) => {
    uiManager.updateStatus(msg);
    if(msg.includes("Connected")) uiManager.updateConnectionState(true, "Connected");
    if(msg.includes("Disconnected")) uiManager.updateConnectionState(false, "Connect Pen");
};

penManager.onDebugInfo = (info) => {
    uiManager.updateDebugInfo(info);
};

penManager.onTrigger = (stroke) => {
    const now = Date.now();
    if (now - lastTriggerTime < TRIGGER_COOLDOWN) return;

    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    const lastP = stroke.points[stroke.points.length - 1];

    if (isInside(lastP, triggerRegion)) {
        console.log("Text trigger detected!");
        uiManager.flashOverlay('text');
        lastTriggerTime = now;
        processGemini('text');
    } else if (isInside(lastP, imageTriggerRegion)) {
        console.log("Image trigger detected!");
        uiManager.flashOverlay('image');
        lastTriggerTime = now;
        processGemini('image');
    }
};

// --- Helper Functions ---

function isInside(p, region) {
    if (!p || !region) return false;
    return (p.x >= region.xMin && p.x <= region.xMax &&
            p.y >= region.yMin && p.y <= region.yMax);
}

async function processGemini(mode) {
    const prompt = mode === 'image' 
        ? uiManager.elements.imagePromptInput.value 
        : uiManager.elements.textPromptInput.value;

    uiManager.showProcessing(mode);
    io.emit('status', `Generating ${mode === 'image' ? 'Image' : 'Response'}...`);

    try {
        // Prepare Image Data
        const exportCanvas = document.createElement('canvas');
        const canvas = uiManager.getCanvas();
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        // Fill white background
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        // Draw strokes (reuse UI logic or duplicte for simplicity? reuse mapToScreen)
        // Need to draw strokes using white bg and black lines for AI
        const mapFn = penManager.mapToScreen.bind(penManager);
        penManager.strokeHistory.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            exportCtx.lineWidth = 2;
            exportCtx.strokeStyle = '#000000';
            exportCtx.lineCap = 'round';
            exportCtx.lineJoin = 'round';
            exportCtx.beginPath();
            stroke.points.forEach((dot, index) => {
                const screen = mapFn(dot.x, dot.y);
                if (index === 0) exportCtx.moveTo(screen.x, screen.y);
                else exportCtx.lineTo(screen.x, screen.y);
            });
            exportCtx.stroke();
        });

        const base64Data = exportCanvas.toDataURL("image/png").split(',')[1];

        const result = await geminiService.generate(mode, prompt, base64Data);
        
        uiManager.showResult(mode, result);
        
        // Save to History
        history.push(result);
        storageManager.saveHistory(history);
        io.emit('result', result);
        io.emit('history', history);

    } catch (e) {
        uiManager.showError(e.message);
    }
}

// --- Start ---
// Initial Canvas Setup
function initCanvas() {
    const rect = uiManager.elements.canvas.parentElement.getBoundingClientRect();
    uiManager.elements.canvas.width = rect.width;
    uiManager.elements.canvas.height = rect.height;
    penManager.setCanvasSize(rect.width, rect.height);
    penManager.onRedraw(); // Draw initial
    uiManager.updateOverlays(penManager.mapToScreen.bind(penManager), {text: triggerRegion, image: imageTriggerRegion}, {definingText: isDefiningBox, definingImage: isDefiningImageBox});
}

window.addEventListener('resize', initCanvas);
window.addEventListener('load', () => {
    penManager.init();
    initCanvas();
    setTimeout(initCanvas, 100);
});
