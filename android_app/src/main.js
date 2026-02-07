// Main Application Logic
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { PenManagerNative } from './services/PenManagerNative.js';
import { GeminiService } from './services/GeminiService.js';
import { StorageManager } from './services/StorageManager.js';

// Initialize Services
const penManager = new PenManagerNative();
const geminiService = new GeminiService();
const storageManager = new StorageManager();

// State
let history = [];
let currentItem = null;
let showingInput = false;
let lastTriggerTime = 0;
const TRIGGER_COOLDOWN = 2000;

// Trigger Regions
const triggerRegion = storageManager.getJSON('triggerRegion', { xMin: 50, xMax: 60, yMin: 80, yMax: 88 });
const imageTriggerRegion = storageManager.getJSON('imageTriggerRegion', { xMin: 40, xMax: 50, yMin: 80, yMax: 88 });

// DOM Elements
function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

const elements = {
    status: document.getElementById('status'),
    result: document.getElementById('result'),
    meta: document.getElementById('meta'),
    actions: document.getElementById('actions'),
    gallery: document.getElementById('gallery'),
    galleryBackdrop: document.getElementById('gallery-backdrop'),
    toggleGallery: document.getElementById('toggle-gallery'),
    closeView: document.getElementById('close-view'),
    headerConnectBtn: document.getElementById('header-connect-btn'),
    headerClearBtn: document.getElementById('header-clear-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    apiKey: document.getElementById('api-key'),
    modelSelect: document.getElementById('model-select'),
    textPrompt: document.getElementById('text-prompt'),
    imagePrompt: document.getElementById('image-prompt'),
    deleteBtn: document.getElementById('delete-btn'),
    copyDownloadBtn: document.getElementById('copy-download-btn'),
    toggleInputBtn: document.getElementById('toggle-input-btn'),
    canvas: document.getElementById('pen-canvas'),
    textRegionInfo: document.getElementById('text-region-info'),
    imageRegionInfo: document.getElementById('image-region-info'),
    choiceModal: document.getElementById('choice-modal'),
    choiceTitle: document.getElementById('choice-title'),
    choiceText: document.getElementById('choice-text'),
    choiceSaveBtn: document.getElementById('choice-save-btn'),
    choiceShareBtn: document.getElementById('choice-share-btn'),
    choiceCancelBtn: document.getElementById('choice-cancel-btn'),
    closeChoiceBtn: document.getElementById('close-choice-btn')
};

const messageModal = {
    modal: document.getElementById('message-modal'),
    title: document.getElementById('message-title'),
    text: document.getElementById('message-text'),
    okBtn: document.getElementById('message-ok-btn'),
    cancelBtn: document.getElementById('message-cancel-btn'),
    closeBtn: document.getElementById('close-message-btn')
};

function uiAlert(msg, title = 'Error') {
    return new Promise((resolve) => {
        messageModal.title.textContent = title;
        messageModal.text.textContent = msg;
        messageModal.cancelBtn.style.display = 'none';
        messageModal.okBtn.textContent = 'OK';
        messageModal.modal.classList.remove('hidden');
        
        const close = () => {
            messageModal.modal.classList.add('hidden');
            cleanup();
            resolve();
        };
        
        const cleanup = () => {
            messageModal.okBtn.removeEventListener('click', close);
            messageModal.closeBtn.removeEventListener('click', close);
        }
        
        messageModal.okBtn.addEventListener('click', close);
        messageModal.closeBtn.addEventListener('click', close);
    });
}

function uiConfirm(msg, title = 'Confirmation') {
    return new Promise((resolve) => {
        messageModal.title.textContent = title;
        messageModal.text.textContent = msg;
        messageModal.cancelBtn.style.display = 'inline-block';
        messageModal.okBtn.textContent = 'OK';
        messageModal.modal.classList.remove('hidden');
        
        const onOk = () => {
            messageModal.modal.classList.add('hidden');
            cleanup();
            resolve(true);
        };
        
        const onCancel = () => {
            messageModal.modal.classList.add('hidden');
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            messageModal.okBtn.removeEventListener('click', onOk);
            messageModal.cancelBtn.removeEventListener('click', onCancel);
            messageModal.closeBtn.removeEventListener('click', onCancel);
        };
        
        messageModal.okBtn.addEventListener('click', onOk);
        messageModal.cancelBtn.addEventListener('click', onCancel);
        messageModal.closeBtn.addEventListener('click', onCancel);
    });
}

function uiChoice(msg, title = 'Select Action') {
    return new Promise((resolve) => {
        elements.choiceTitle.textContent = title;
        elements.choiceText.textContent = msg;
        elements.choiceModal.classList.remove('hidden');
        
        const cleanup = () => {
            elements.choiceSaveBtn.removeEventListener('click', onSave);
            elements.choiceShareBtn.removeEventListener('click', onShare);
            elements.choiceCancelBtn.removeEventListener('click', onCancel);
            elements.closeChoiceBtn.removeEventListener('click', onCancel);
            elements.choiceModal.classList.add('hidden');
        };
        
        const onSave = () => {
            cleanup();
            resolve('save');
        };
        
        const onShare = () => {
            cleanup();
            resolve('share');
        };
        
        const onCancel = () => {
            cleanup();
            resolve('cancel');
        };
        
        elements.choiceSaveBtn.addEventListener('click', onSave);
        elements.choiceShareBtn.addEventListener('click', onShare);
        elements.choiceCancelBtn.addEventListener('click', onCancel);
        elements.closeChoiceBtn.addEventListener('click', onCancel);
    });
}

// Canvas for live drawing
let canvasContext = null;
let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;

// Initialize
async function init() {
    // Load settings
    const savedSettings = {
        apiKey: storageManager.get('geminiApiKey', ''),
        model: storageManager.get('geminiModel', 'gemini-3-flash-preview'),
        textPrompt: storageManager.get('geminiTextPrompt', elements.textPrompt.value),
        imagePrompt: storageManager.get('geminiImagePrompt', elements.imagePrompt.value)
    };
    
    elements.apiKey.value = savedSettings.apiKey;
    elements.modelSelect.value = savedSettings.model;
    elements.textPrompt.value = savedSettings.textPrompt;
    elements.imagePrompt.value = savedSettings.imagePrompt;
    
    geminiService.setApiKey(savedSettings.apiKey);
    geminiService.setModel(savedSettings.model);
    
    // Update trigger region display
    elements.textRegionInfo.textContent = `X: ${triggerRegion.xMin}-${triggerRegion.xMax}, Y: ${triggerRegion.yMin}-${triggerRegion.yMax}`;
    elements.imageRegionInfo.textContent = `X: ${imageTriggerRegion.xMin}-${imageTriggerRegion.xMax}, Y: ${imageTriggerRegion.yMin}-${imageTriggerRegion.yMax}`;
    
    // Initialize live drawing canvas
    initLiveCanvas();
    
    // Load history
    history = await storageManager.loadHistory();
    renderGallery();
    
    // Setup pen manager
    penManager.init();
    penManager.onStatusChange = (msg) => {
        updateStatus(msg);
        if (penManager.connectedDevice) {
            elements.headerConnectBtn.classList.add('connected');
            elements.headerConnectBtn.innerHTML = '<img src="/connected.svg" alt="Connected">';
        } else {
            elements.headerConnectBtn.classList.remove('connected');
            elements.headerConnectBtn.innerHTML = '<img src="/connect.svg" alt="Connect">';
        }
    };
    
    updateStatus('Connect Pen');
    
    penManager.onTrigger = (stroke) => {
        const now = Date.now();
        if (now - lastTriggerTime < TRIGGER_COOLDOWN) return;
        
        if (!stroke || !stroke.points || stroke.points.length === 0) return;
        const lastP = stroke.points[stroke.points.length - 1];
        
        if (isInside(lastP, triggerRegion)) {
            console.log("Text trigger detected!");
            lastTriggerTime = now;
            processGemini('text');
        } else if (isInside(lastP, imageTriggerRegion)) {
            console.log("Image trigger detected!");
            lastTriggerTime = now;
            processGemini('image');
        }
    };
    
    // Hook into pen strokes for live rendering
    penManager.onStrokeUpdate = renderLiveStroke;
    penManager.onRedraw = redrawAllStrokes;
    
    setupEventListeners();
}

// Initialize live canvas
function initLiveCanvas() {
    elements.canvas.width = canvasWidth;
    elements.canvas.height = canvasHeight;
    canvasContext = elements.canvas.getContext('2d');
    canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
}

// Render strokes in real-time
function renderLiveStroke(stroke) {
    if (!canvasContext || !stroke || !stroke.points || stroke.points.length === 0) return;
    
    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = '#666666';
    canvasContext.lineCap = 'round';
    canvasContext.lineJoin = 'round';
    canvasContext.beginPath();
    
    stroke.points.forEach((dot, index) => {
        // Convert from pen coordinates (0-61 x, 0-88 y) to canvas coordinates
        const x = (dot.x / 61) * canvasWidth;
        const y = (dot.y / 88) * canvasHeight;
        
        if (index === 0) {
            canvasContext.moveTo(x, y);
        } else {
            canvasContext.lineTo(x, y);
        }
    });
    
    canvasContext.stroke();
}

// Redraw all strokes (called when page changes)
function redrawAllStrokes() {
    if (!canvasContext) return;
    
    // Clear canvas
    canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Redraw all strokes from current page's history
    if (penManager.strokeHistory && penManager.strokeHistory.length > 0) {
        penManager.strokeHistory.forEach(stroke => {
            renderLiveStroke(stroke);
        });
    }
}

function setupEventListeners() {
    // Gallery
    elements.toggleGallery.addEventListener('click', toggleGallery);
    elements.galleryBackdrop.addEventListener('click', toggleGallery);
    elements.closeView.addEventListener('click', clearView);
    
    // Settings
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.remove('hidden');
    });
    
    elements.closeSettingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.add('hidden');
    });
    
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            elements.settingsModal.classList.add('hidden');
        }
    });
    
    // Header Pen Controls
    elements.headerConnectBtn.addEventListener('click', async () => {
        try {
            updateStatus('Connecting...');
            await penManager.connect();
        } catch (e) {
            await uiAlert('Failed to connect to pen: ' + e.message, 'Connection Error');
            updateStatus('Connect Pen');
        }
    });
    
    elements.headerClearBtn.addEventListener('click', async () => {
        if (await uiConfirm('Clear page? (Cannot be undone)', 'Clear Page')) {
            penManager.clearCanvas();
            initLiveCanvas();
            updateStatus('Canvas cleared');
        }
    });

    // Clear Data
    if (elements.clearDataBtn) {
        elements.clearDataBtn.addEventListener('click', async () => {
            if (await uiConfirm('This will delete all your settings, API key, and history from this device. Are you sure?', 'Clear All Data')) {
                await storageManager.clearAll();
                await uiAlert('Data cleared. The app will now reload.', 'Cleared');
                location.reload();
            }
        });
    }

    // Settings inputs
    elements.apiKey.addEventListener('input', () => {
        const value = elements.apiKey.value;
        storageManager.setValue('geminiApiKey', value);
        geminiService.setApiKey(value);
    });
    
    elements.modelSelect.addEventListener('change', () => {
        const value = elements.modelSelect.value;
        storageManager.setValue('geminiModel', value);
        geminiService.setModel(value);
    });
    
    elements.textPrompt.addEventListener('input', () => {
        storageManager.setValue('geminiTextPrompt', elements.textPrompt.value);
    });
    
    elements.imagePrompt.addEventListener('input', () => {
        storageManager.setValue('geminiImagePrompt', elements.imagePrompt.value);
    });
    
    // Actions
    elements.deleteBtn.addEventListener('click', deleteCurrent);
    elements.copyDownloadBtn.addEventListener('click', secondaryAction);
    elements.toggleInputBtn.addEventListener('click', toggleInput);
    
    // Touch gestures for zoom/pan
    setupTouchGestures();
}

// Gallery
function toggleGallery() {
    elements.gallery.classList.toggle('open');
    elements.galleryBackdrop.classList.toggle('visible');
    
    if (elements.gallery.classList.contains('open')) {
        elements.toggleGallery.innerHTML = '✕';
    } else {
        elements.toggleGallery.innerHTML = '☰';
    }
}

function renderGallery() {
    elements.gallery.innerHTML = '';
    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.onclick = () => {
            showItem(item);
            if (elements.gallery.classList.contains('open')) {
                toggleGallery();
            }
        };
        
        if (item.type === 'image') {
            div.innerHTML = `<img src="${item.url}" alt="Generated image">`;
        } else {
            const preview = item.content.replace(/\*\*/g, '').substring(0, 50);
            div.innerHTML = `<div class="text-preview">${preview}...</div>`;
        }
        
        if (item.timestamp) {
            const dateDiv = document.createElement('div');
            dateDiv.className = 'gallery-date';
            const d = new Date(item.timestamp);
            dateDiv.innerText = d.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit' 
            });
            div.appendChild(dateDiv);
        }
        
        elements.gallery.prepend(div);
    });
}

function showItem(item) {
    currentItem = item;
    showingInput = false;
    // Hide logo when viewing items
    elements.status.style.display = 'none';
    elements.actions.style.display = 'flex';
    elements.closeView.classList.remove('hidden-element');
    
    // Hide live canvas when viewing output
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.style.display = 'none';
    
    if (item.timestamp) {
        const date = new Date(item.timestamp);
        elements.meta.innerText = date.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit' 
        });
    } else {
        elements.meta.innerText = '';
    }
    
    if (item.type === 'text') {
        elements.copyDownloadBtn.innerHTML = 'Copy';
    } else {
        elements.copyDownloadBtn.innerHTML = 'Download';
    }
    
    if (item.inputUrl) {
        elements.toggleInputBtn.classList.remove('hidden-element');
        elements.toggleInputBtn.style.display = 'flex';
        elements.toggleInputBtn.innerHTML = 'Input';
    } else {
        elements.toggleInputBtn.classList.add('hidden-element');
        elements.toggleInputBtn.style.display = 'none';
    }
    
    renderContent(item);
}

function renderContent(item) {
    if (item.type === 'text') {
        const cleanText = item.content.replace(/\*\*/g, '');
        elements.result.innerHTML = `<div class="text-content">${cleanText}</div>`;
    } else if (item.type === 'image') {
        elements.result.innerHTML = `<img src="${item.url}" alt="Generated image">`;
        resetZoom();
    }
}

function clearView() {
    currentItem = null;
    elements.result.innerHTML = '';
    elements.meta.innerText = '';
    
    elements.status.style.display = 'block';
    if (penManager.connectedDevice) {
        updateStatus('Pen connected');
    } else {
        updateStatus('Connect Pen');
    }
    
    elements.actions.style.display = 'none';
    elements.closeView.classList.add('hidden-element');
    
    // Show live canvas when returning to main view
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.style.display = 'flex';
}

async function deleteCurrent() {
    if (!currentItem) return;
    
    if (await uiConfirm('Delete this item? (Cannot be undone)', 'Delete')) {
        const index = history.indexOf(currentItem);
        if (index > -1) {
            history.splice(index, 1);
            storageManager.saveHistory(history);
            renderGallery();
            clearView();
        }
    }
}

async function secondaryAction() {
    if (!currentItem) return;
    
    try {
        if (currentItem.type === 'text') {
            const text = currentItem.content.replace(/\*\*/g, '');
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                fallbackCopyText(text);
            }
            
            const originalText = elements.copyDownloadBtn.innerHTML;
            elements.copyDownloadBtn.innerHTML = 'Copied';
            setTimeout(() => elements.copyDownloadBtn.innerHTML = originalText, 1500);
            
        } else if (currentItem.type === 'image') {
            const choice = await uiChoice("Do you want to share this image or save it to your device?");
            if (choice === 'cancel') return;
            
            let filename = 'inklogic_generated.png';
            if (currentItem.timestamp) {
                const date = new Date(currentItem.timestamp);
                const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 16).replace('T', '_');
                filename = `inklogic_${dateStr}.png`;
            }
            
            if (choice === 'share') {
                // Try Share via Capacitor Plugin
                try {
                    // Write to cache for sharing
                    const base64Data = currentItem.url.split(',')[1];
                    const savedFile = await Filesystem.writeFile({
                        path: filename,
                        data: base64Data,
                        directory: Directory.Cache
                    });

                    await Share.share({
                        title: 'InkLogic Image',
                        text: 'Generated by InkLogic',
                        url: savedFile.uri,
                        dialogTitle: 'Share Image'
                    });
                } catch (shareErr) {
                    if (shareErr.message !== 'Share canceled') {
                        console.error("Share failed:", shareErr);
                        await uiAlert("Share failed: " + shareErr.message, "Error");
                    }
                }
            } else if (choice === 'save') {
                // Filesystem Save
                try {
                    const base64Data = currentItem.url.split(',')[1];
                    await Filesystem.writeFile({
                        path: filename,
                        data: base64Data,
                        directory: Directory.Documents
                    });
                    await uiAlert(`Saved to Documents/${filename}`, 'Saved');
                    return;
                } catch (fsErr) {
                    console.error("Filesystem save failed:", fsErr);
                    
                    // Fallback to link download
                    try {
                        const a = document.createElement('a');
                        a.href = currentItem.url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    } catch (downloadErr) {
                        await uiAlert("Failed to save image: " + fsErr.message, "Error");
                    }
                }
            }
        }
    } catch (err) {
        console.error("Action failed:", err);
        await uiAlert("Action failed: " + err.message, 'Error');
    }
}

function fallbackCopyText(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (!successful) throw new Error('Copy command failed');
    } catch (err) {
        console.error('Fallback copy failed', err);
        throw err;
    }
    
    document.body.removeChild(textArea);
}

function toggleInput() {
    if (!currentItem || !currentItem.inputUrl) return;
    
    showingInput = !showingInput;
    
    if (showingInput) {
        elements.result.innerHTML = `<img src="${currentItem.inputUrl}" class="inverted-image" alt="Input sketch">`;
        resetZoom();
        elements.toggleInputBtn.innerHTML = 'Output';
    } else {
        renderContent(currentItem);
        elements.toggleInputBtn.innerHTML = 'Input';
    }
}

// Gemini Processing
async function processGemini(mode) {
    const prompt = mode === 'image' ? elements.imagePrompt.value : elements.textPrompt.value;
    
    // Show status and hide result when generating
    elements.status.style.display = 'block';
    elements.actions.style.display = 'none';
    elements.closeView.classList.add('hidden-element');
    updateStatus(`Generating ${mode === 'image' ? 'Image' : 'Response'}...`);
    elements.result.innerHTML = '';
    
    try {
        const exportCanvas = document.createElement('canvas');
        const canvas = elements.canvas;
        exportCanvas.width = 800;
        exportCanvas.height = 800;
        const exportCtx = exportCanvas.getContext('2d');
        
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        penManager.strokeHistory.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;
            exportCtx.lineWidth = 2;
            exportCtx.strokeStyle = '#000000';
            exportCtx.lineCap = 'round';
            exportCtx.lineJoin = 'round';
            exportCtx.beginPath();
            stroke.points.forEach((dot, index) => {
                const x = (dot.x / 61) * exportCanvas.width;
                const y = (dot.y / 88) * exportCanvas.height;
                if (index === 0) exportCtx.moveTo(x, y);
                else exportCtx.lineTo(x, y);
            });
            exportCtx.stroke();
        });
        
        const base64Data = exportCanvas.toDataURL("image/png").split(',')[1];
        const result = await geminiService.generate(mode, prompt, base64Data);
        
        history.push(result);
        await storageManager.saveHistory(history);
        renderGallery();
        showItem(result);
        
    } catch (e) {
        console.error('Gemini error:', e);
        updateStatus('Error: ' + e.message);
        elements.result.innerHTML = `<div class="text-content">Error: ${e.message}</div>`;
    }
}

function updateStatus(msg) {
    elements.status.style.display = 'block';
    
    if (msg === 'Canvas cleared') {
         elements.status.innerHTML = msg;
         setTimeout(() => {
             if (penManager.connectedDevice) {
                 elements.status.innerHTML = 'Pen connected';
             } else {
                 elements.status.innerHTML = 'Connect Pen';
             }
         }, 1500);
    } else if (msg.includes('Generating')) {
        elements.status.innerHTML = `<div class="loader loader-margin"></div><br>${msg}`;
    } else if (msg.includes('Error')) {
        elements.status.innerHTML = `<span style="color: #f44">${msg}</span>`;
    } else {
        elements.status.innerHTML = msg;
    }
}

function isInside(p, region) {
    if (!p || !region) return false;
    return (p.x >= region.xMin && p.x <= region.xMax &&
            p.y >= region.yMin && p.y <= region.yMax);
}

// Touch Gestures
let currentScale = 1;
let startScale = 1;
let initialDist = 0;
let translateX = 0;
let translateY = 0;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let isDragging = false;

function setupTouchGestures() {
    elements.result.addEventListener('touchstart', (e) => {
        const img = elements.result.querySelector('img');
        if (!img) return;
        
        if (e.touches.length === 2) {
            e.preventDefault();
            initialDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            startScale = currentScale;
        } else if (e.touches.length === 1 && currentScale > 1) {
            e.preventDefault();
            startX = e.touches[0].pageX;
            startY = e.touches[0].pageY;
            lastX = translateX;
            lastY = translateY;
            isDragging = true;
        }
    }, { passive: false });
    
    elements.result.addEventListener('touchmove', (e) => {
        const img = elements.result.querySelector('img');
        if (!img) return;
        
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            if (initialDist > 0) {
                const delta = dist / initialDist;
                currentScale = Math.min(Math.max(1, startScale * delta), 5);
                updateTransform(img);
            }
        } else if (e.touches.length === 1 && isDragging && currentScale > 1) {
            e.preventDefault();
            const dx = e.touches[0].pageX - startX;
            const dy = e.touches[0].pageY - startY;
            translateX = lastX + dx;
            translateY = lastY + dy;
            updateTransform(img);
        }
    }, { passive: false });
    
    elements.result.addEventListener('touchend', () => {
        isDragging = false;
    });
}

function updateTransform(img) {
    if (currentScale <= 1) {
        currentScale = 1;
        translateX = 0;
        translateY = 0;
    }
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
}

function resetZoom() {
    currentScale = 1;
    translateX = 0;
    translateY = 0;
    const img = elements.result.querySelector('img');
    if (img) updateTransform(img);
}

// Start the app
init();
