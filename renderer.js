// Patch for .nproj files
if (require.extensions) {
    require.extensions['.nproj'] = function (module, filename) {
        module.exports = filename;
    };
}

const PenHelper = require('web_pen_sdk/dist/PenCotroller/PenHelper').default;
const PenMessageType = require('web_pen_sdk/dist/API/PenMessageType').default;
const { ipcRenderer } = require('electron');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// Ensure output directory exists
const outputDir = path.join(__dirname, 'generated_images');
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

// History Management
const historyFile = path.join(__dirname, 'history.json');
let history = [];

if (fs.existsSync(historyFile)) {
    try {
        history = JSON.parse(fs.readFileSync(historyFile));
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}

function saveHistory() {
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// Preview Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'preview')));
app.use('/images', express.static(outputDir));

io.on('connection', (socket) => {
    console.log('Preview client connected');
    socket.emit('history', history); // Send history on connect

    socket.on('delete_item', (index) => {
        if (index >= 0 && index < history.length) {
            history.splice(index, 1);
            saveHistory();
            io.emit('history', history); // Broadcast update
        }
    });
});

server.listen(3000, () => {
    console.log('Preview server running on http://localhost:3000');
});

// UI Elements
const connectBtn = document.getElementById('connectBtn');
const clearBtn = document.getElementById('clearBtn');
const statusSpan = document.getElementById('status');
const responsePreview = document.getElementById('response-preview');
const canvas = document.getElementById('penCanvas');
const ctx = canvas.getContext('2d');
const apiKeyInput = document.getElementById('apiKey');
const textPromptInput = document.getElementById('prompt');
const imagePromptInput = document.getElementById('imagePrompt');
const sendBtn = document.getElementById('sendBtn');
const genImageBtn = document.getElementById('genImageBtn');
const defineBoxBtn = document.getElementById('defineBoxBtn');
const defineImageBoxBtn = document.getElementById('defineImageBoxBtn');
const responseArea = document.getElementById('response-area');
const generatedImage = document.getElementById('generated-image');
const debugInfo = document.getElementById('debug-info');
const checkboxOverlay = document.getElementById('checkbox-overlay');
const imageTriggerOverlay = document.getElementById('image-trigger-overlay');
const placeholderText = document.getElementById('placeholder-text');
const clearOutputBtn = document.getElementById('clearOutputBtn');

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

// Settings Logic
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
});

// Clear Output Logic
clearOutputBtn.addEventListener('click', () => {
    generatedImage.style.display = 'none';
    responseArea.innerText = '';
    responseArea.style.display = 'none';
    placeholderText.style.display = 'block';
    statusSpan.innerText = "Output cleared";
});

// Load saved prompts
const savedTextPrompt = localStorage.getItem('geminiTextPrompt');
if (savedTextPrompt) {
    textPromptInput.value = savedTextPrompt;
}

textPromptInput.addEventListener('input', () => {
    localStorage.setItem('geminiTextPrompt', textPromptInput.value);
});

const savedImagePrompt = localStorage.getItem('geminiImagePrompt');
if (savedImagePrompt) {
    imagePromptInput.value = savedImagePrompt;
}

imagePromptInput.addEventListener('input', () => {
    localStorage.setItem('geminiImagePrompt', imagePromptInput.value);
});

// State - FIXED COORDINATES based on user feedback
let paperSize = { 
    Xmin: 0, 
    Xmax: 61, 
    Ymin: 0, 
    Ymax: 88, 
    width: 61, 
    height: 88 
};
let lastPoint = null;
let isPenDown = false;
let strokeHistory = []; 
let currentStroke = null;

let isDefiningBox = false; // Text Trigger
let isDefiningImageBox = false; // Image Trigger

let triggerRegion = null; // Text
let imageTriggerRegion = null; // Image

let lastTriggerTime = 0;
const TRIGGER_COOLDOWN = 5000; // 5 seconds cooldown

// Load saved trigger regions
const savedRegion = localStorage.getItem('triggerRegion');
if (savedRegion) {
    triggerRegion = JSON.parse(savedRegion);
} else {
    triggerRegion = { xMin: 50, xMax: 60, yMin: 80, yMax: 88 };
}

const savedImageRegion = localStorage.getItem('imageTriggerRegion');
if (savedImageRegion) {
    imageTriggerRegion = JSON.parse(savedImageRegion);
} else {
    // Default image trigger (next to text trigger?)
    imageTriggerRegion = { xMin: 40, xMax: 50, yMin: 80, yMax: 88 };
}

// Canvas resizing
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    redrawAll();
    updateOverlays();
}

function updateOverlays() {
    updateOverlay(checkboxOverlay, triggerRegion, isDefiningBox, "Text");
    updateOverlay(imageTriggerOverlay, imageTriggerRegion, isDefiningImageBox, "Image");
}

function updateOverlay(element, region, isDefining, label) {
    if (!region) {
        element.style.display = 'none';
        return;
    }

    const coords = mapToScreen(region.xMin, region.yMin);
    const coordsMax = mapToScreen(region.xMax, region.yMax);
    
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

function mapToScreen(x, y) {
    const view = { width: canvas.width, height: canvas.height };
    const p = 0.01;
    const uw = view.width * (1 - 2 * p);
    const uh = view.height * (1 - 2 * p);
    const pw = Math.max(paperSize.width, 0.0001); 
    const ph = Math.max(paperSize.height, 0.0001);
    const scale = Math.min(uw / pw, uh / ph);
    const ox = (view.width - (pw * scale)) / 2;
    const oy = (view.height - (ph * scale)) / 2;
    
    return {
        x: (x - paperSize.Xmin) * scale + ox,
        y: (y - paperSize.Ymin) * scale + oy
    };
}

function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Page Border
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333333';
    const topLeft = mapToScreen(paperSize.Xmin, paperSize.Ymin);
    const bottomRight = mapToScreen(paperSize.Xmax, paperSize.Ymax);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    
    strokeHistory.forEach(stroke => drawStroke(stroke));
    if (currentStroke) drawStroke(currentStroke);
}

function drawStroke(stroke) {
    if (!stroke.points || stroke.points.length === 0) return;
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    stroke.points.forEach((dot, index) => {
        const screen = mapToScreen(dot.x, dot.y);
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
    });
    ctx.stroke();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', () => {
    resizeCanvas();
    setTimeout(resizeCanvas, 100);
});

// Definition Logic
let definitionPoints = [];

function toggleDefinition(type) {
    const isText = type === 'text';
    
    // If starting one definition, stop the other
    if (isText) isDefiningImageBox = false;
    else isDefiningBox = false;

    let isDefining = isText ? isDefiningBox : isDefiningImageBox;
    const btn = isText ? defineBoxBtn : defineImageBoxBtn;
    
    if (!isDefining) {
        // Start
        if (isText) isDefiningBox = true; else isDefiningImageBox = true;
        definitionPoints = [];
        btn.innerText = "Finish Defining";
        btn.classList.add('active');
        statusSpan.innerText = `Draw the ${type} trigger area on paper, then click Finish.`;
    } else {
        // Finish
        if (isText) isDefiningBox = false; else isDefiningImageBox = false;
        btn.innerText = isText ? "Define Text Box" : "Define Image Box";
        btn.classList.remove('active');
        
        if (definitionPoints.length > 0) {
            const xs = definitionPoints.map(p => p.x);
            const ys = definitionPoints.map(p => p.y);
            const region = {
                xMin: Math.min(...xs) - 0.05,
                xMax: Math.max(...xs) + 0.05,
                yMin: Math.min(...ys) - 0.05,
                yMax: Math.max(...ys) + 0.05
            };
            
            if (isText) {
                triggerRegion = region;
                localStorage.setItem('triggerRegion', JSON.stringify(triggerRegion));
            } else {
                imageTriggerRegion = region;
                localStorage.setItem('imageTriggerRegion', JSON.stringify(imageTriggerRegion));
            }
            statusSpan.innerText = `${type} trigger box saved!`;
        } else {
            statusSpan.innerText = "No drawing detected. Trigger box unchanged.";
        }
    }
    updateOverlays();
}

defineBoxBtn.addEventListener('click', () => toggleDefinition('text'));
defineImageBoxBtn.addEventListener('click', () => toggleDefinition('image'));

// Pen Connection
connectBtn.addEventListener('click', async () => {
    try {
        connectBtn.innerText = "Connecting...";
        connectBtn.disabled = true;
        await PenHelper.scanPen();
    } catch (e) {
        console.error(e);
        statusSpan.innerText = "Failed to connect";
        connectBtn.disabled = false;
        connectBtn.innerText = "Connect Pen";
    }
});

PenHelper.messageCallback = (mac, type, args) => {
    if (type === PenMessageType.PEN_CONNECTION_SUCCESS) {
        connectBtn.innerText = "Connected";
        statusSpan.innerText = "Connected to " + mac;
    } else if (type === PenMessageType.PEN_DISCONNECTED) {
        connectBtn.innerText = "Connect Pen";
        connectBtn.disabled = false;
        statusSpan.innerText = "Disconnected";
    }
};

PenHelper.dotCallback = (mac, dot) => {
    if (dot.x <= 0.1 && dot.y <= 0.1) return;

    // Update Debug Info
    debugInfo.innerText = `Last Pen: x=${dot.x.toFixed(4)}, y=${dot.y.toFixed(4)}`;

    const screen = mapToScreen(dot.x, dot.y);

    if (dot.dotType === 0) { // Down
        currentStroke = { points: [{ x: dot.x, y: dot.y }] };
        isPenDown = true;
        lastPoint = screen;
    } else if (dot.dotType === 1) { // Move
        if (!isPenDown || !currentStroke) {
             currentStroke = { points: [{ x: dot.x, y: dot.y }] };
             isPenDown = true;
             lastPoint = screen;
        }
        currentStroke.points.push({ x: dot.x, y: dot.y });
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(screen.x, screen.y);
        ctx.stroke();
        
        lastPoint = screen;
    } else if (dot.dotType === 2) { // Up
        if (isPenDown && currentStroke) {
            currentStroke.points.push({ x: dot.x, y: dot.y });
            
            if (isDefiningBox || isDefiningImageBox) {
                definitionPoints.push(...currentStroke.points);
            } else {
                strokeHistory.push(currentStroke);
                localStorage.setItem('strokeHistory', JSON.stringify(strokeHistory));
                checkTriggerRegions(currentStroke);
            }
            
            currentStroke = null;
        }
        isPenDown = false;
        lastPoint = null;
    }
};

function checkTriggerRegions(stroke) {
    // Check cooldown
    const now = Date.now();
    if (now - lastTriggerTime < TRIGGER_COOLDOWN) {
        console.log("Trigger ignored due to cooldown");
        return;
    }

    const lastP = stroke.points[stroke.points.length - 1];
    
    // Check Text Region
    if (triggerRegion && isInside(lastP, triggerRegion)) {
        console.log("Text trigger detected!");
        statusSpan.innerText = "Text trigger detected! Sending to Gemini...";
        lastTriggerTime = now;
        callGemini('text');
        return;
    }
    
    // Check Image Region
    if (imageTriggerRegion && isInside(lastP, imageTriggerRegion)) {
        console.log("Image trigger detected!");
        statusSpan.innerText = "Image trigger detected! Generating Image...";
        lastTriggerTime = now;
        callGemini('image');
        return;
    }
}

function isInside(p, region) {
    return (p.x >= region.xMin && p.x <= region.xMax &&
            p.y >= region.yMin && p.y <= region.yMax);
}

// Clear Canvas
clearBtn.addEventListener('click', () => {
    strokeHistory = [];
    currentStroke = null;
    redrawAll();
    generatedImage.style.display = 'none';
    placeholderText.style.display = 'block';
    responseArea.style.display = 'none';
});

// Gemini Integration
sendBtn.addEventListener('click', () => callGemini('text'));
genImageBtn.addEventListener('click', () => callGemini('image'));

async function callGemini(mode) {
    const apiKey = apiKeyInput.value;
    if (!apiKey) {
        alert("Please enter a Gemini API Key.");
        return;
    }

    const statusText = mode === 'image' ? "Generating Image..." : "Sending to Gemini...";
    statusSpan.innerText = statusText;
    
    // UI Update
    placeholderText.style.display = 'none';
    generatedImage.style.display = 'none';
    responseArea.style.display = 'block';
    responseArea.innerText = "Thinking...";

    // Get prompt from settings
    let prompt;
    if (mode === 'image') {
        prompt = imagePromptInput.value;
    } else {
        prompt = textPromptInput.value;
    }

    // Show prompt in UI
    responsePreview.innerText = `Sending: ${prompt}`;
    responseArea.innerText = `[${mode.toUpperCase()}] Sending Prompt:\n"${prompt}"\n\nThinking...`;
    
    // Notify Preview
    io.emit('status', `Generating ${mode === 'image' ? 'Image' : 'Response'}...`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        const modelName = mode === 'image' ? 'gemini-3-pro-image-preview' : 'gemini-3-pro-preview';
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            apiVersion: "v1beta"
        });
        
        // Invert colors
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        strokeHistory.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            exportCtx.lineWidth = 2;
            exportCtx.strokeStyle = '#000000';
            exportCtx.lineCap = 'round';
            exportCtx.lineJoin = 'round';
            exportCtx.beginPath();
            stroke.points.forEach((dot, index) => {
                const screen = mapToScreen(dot.x, dot.y); 
                if (index === 0) exportCtx.moveTo(screen.x, screen.y);
                else exportCtx.lineTo(screen.x, screen.y);
            });
            exportCtx.stroke();
        });

        const dataUrl = exportCanvas.toDataURL("image/png");
        const base64Data = dataUrl.split(',')[1];

        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/png"
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        
        if (mode === 'image') {
            if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
                const parts = response.candidates[0].content.parts;
                let foundImage = false;
                for (const part of parts) {
                    if (part.inlineData) {
                        const imgData = part.inlineData.data;
                        const mime = part.inlineData.mimeType || 'image/png';
                        generatedImage.src = `data:${mime};base64,${imgData}`;
                        generatedImage.style.display = 'block';
                        responseArea.style.display = 'none'; // Hide text area if image found
                        foundImage = true;
                        
                        // Save Image
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const filename = `image_${timestamp}.png`;
                        const filePath = path.join(outputDir, filename);
                        fs.writeFile(filePath, imgData, 'base64', (err) => {
                            if (err) console.error("Failed to save image:", err);
                            else {
                                console.log("Image saved to:", filePath);
                                // Result Object
                                const resultItem = { 
                                    type: 'image', 
                                    url: `/images/${filename}`,
                                    timestamp: new Date().toISOString()
                                };
                                
                                // Emit result
                                io.emit('result', resultItem);
                                
                                // Save to History
                                history.push(resultItem);
                                saveHistory();
                                io.emit('history', history);
                            }
                        });
                    } else if (part.text) {
                        responseArea.innerText = part.text;
                    }
                }
                statusSpan.innerText = foundImage ? "Image generated!" : "No image returned.";
            } else {
                responseArea.innerText = "Unexpected response structure.";
            }
        } else {
            const text = response.text();
            responseArea.innerText = text;
            statusSpan.innerText = "Response received!";
            
            // Result Object
            const resultItem = { 
                type: 'text', 
                content: text,
                timestamp: new Date().toISOString()
            };
            
            // Emit to Preview
            io.emit('result', resultItem);
            
            // Save to History
            history.push(resultItem);
            saveHistory();
            io.emit('history', history);
        }

    } catch (error) {
        console.error("Gemini Error:", error);
        responseArea.innerText = "Error: " + error.message;
        statusSpan.innerText = "Error sending to Gemini";
    }
}

// Device Picker Logic
ipcRenderer.on('bluetooth-device-list', (event, deviceList) => {
    showDevicePicker(deviceList);
});

function showDevicePicker(devices) {
    let picker = document.getElementById('device-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'device-picker';
        document.body.appendChild(picker);
    }

    picker.innerHTML = '<h3>Select a Device</h3>';
    if (devices.length === 0) {
        picker.innerHTML += '<p>No devices found.</p>';
        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = () => {
            ipcRenderer.send('bluetooth-device-selected', '');
            picker.remove();
        };
        picker.appendChild(cancelBtn);
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
    
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.style.marginTop = '10px';
    cancelBtn.onclick = () => {
        ipcRenderer.send('bluetooth-device-selected', '');
        picker.remove();
    };
    picker.appendChild(cancelBtn);
}

// Save/Load API Key
const savedKey = localStorage.getItem('geminiApiKey');
if (savedKey) {
    apiKeyInput.value = savedKey;
}

apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('geminiApiKey', apiKeyInput.value);
});
