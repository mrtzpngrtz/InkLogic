// PenManager.js - Handles Pen SDK interactions and state
const PenHelper = require('web_pen_sdk/dist/PenCotroller/PenHelper').default;
const PenMessageType = require('web_pen_sdk/dist/API/PenMessageType').default;

class PenManager {
    constructor() {
        this.paperSize = { 
            Xmin: 0, Xmax: 61, Ymin: 0, Ymax: 88, 
            width: 61, height: 88 
        };
        this.strokeHistory = [];
        this.currentStroke = null;
        this.isPenDown = false;
        this.notebookData = {};
        this.currentPageId = null;
        
        // Callbacks
        this.onRedraw = null;
        this.onStatusChange = null;
        this.onDebugInfo = null;
        this.onTrigger = null; // (points, type) => void
    }

    init() {
        this.loadHistory();
        
        // Setup SDK Callbacks
        PenHelper.messageCallback = this.handleMessage.bind(this);
        PenHelper.dotCallback = this.handleDot.bind(this);
        PenHelper.pageCallback = this.handlePage.bind(this);
    }

    loadHistory() {
        try {
            const savedData = localStorage.getItem('notebookData');
            if (savedData) {
                this.notebookData = JSON.parse(savedData);
                console.log("Loaded notebook data:", Object.keys(this.notebookData).length, "pages");
            }
            
            const lastPage = localStorage.getItem('lastPageId');
            if (lastPage && this.notebookData[lastPage]) {
                 this.currentPageId = lastPage;
                 this.strokeHistory = this.notebookData[lastPage];
                 console.log("Restored last page:", this.currentPageId);
            } else {
                 const savedHistory = localStorage.getItem('strokeHistory');
                 if (savedHistory) {
                     this.strokeHistory = JSON.parse(savedHistory);
                 }
            }
        } catch (e) {
            console.error("Error loading history:", e);
        }
    }

    saveHistory() {
        if (this.currentPageId) {
            this.notebookData[this.currentPageId] = this.strokeHistory;
            localStorage.setItem('notebookData', JSON.stringify(this.notebookData));
        } else {
            localStorage.setItem('strokeHistory', JSON.stringify(this.strokeHistory));
        }
    }

    async connect() {
        try {
            if(this.onStatusChange) this.onStatusChange("Connecting...");
            await PenHelper.scanPen();
        } catch (e) {
            console.error(e);
            if(this.onStatusChange) this.onStatusChange("Failed to connect");
            throw e;
        }
    }

    handleMessage(mac, type, args) {
        if (type === PenMessageType.PEN_CONNECTION_SUCCESS) {
            if(this.onStatusChange) this.onStatusChange("Connected to " + mac);
        } else if (type === PenMessageType.PEN_DISCONNECTED) {
            if(this.onStatusChange) this.onStatusChange("Disconnected");
        }
    }

    handleDot(mac, dot) {
        if (dot.x <= 0.1 && dot.y <= 0.1) return;

        // Extract Page Info
        const section = dot.section || (dot.pageInfo && dot.pageInfo.section);
        const owner = dot.owner || (dot.pageInfo && dot.pageInfo.owner);
        const note = dot.note || dot.book || (dot.pageInfo && (dot.pageInfo.note || dot.pageInfo.book));
        const page = dot.page || (dot.pageInfo && dot.pageInfo.page);
        
        const pageId = `${section}_${owner}_${note}_${page}`;
        
        // Debug
        if(this.onDebugInfo) {
            try {
                const infoStr = dot.pageInfo ? JSON.stringify(dot.pageInfo) : "No pageInfo";
                this.onDebugInfo(`ID: ${pageId} | Info: ${infoStr}`);
            } catch (e) {
                this.onDebugInfo(`ID: ${pageId} | Error reading info`);
            }
        }

        // Fallback Page Recognition
        const isValidPage = Number.isInteger(section) && Number.isInteger(owner) && Number.isInteger(note) && Number.isInteger(page);
        if (isValidPage && this.currentPageId !== pageId) {
            console.log(`Fallback Page Switch: ${this.currentPageId} -> ${pageId}`);
            this.handlePage(dot);
        }

        // Screen mapping
        const screen = this.mapToScreen(dot.x, dot.y);

        if (dot.dotType === 0) { // Down
            this.currentStroke = { points: [{ x: dot.x, y: dot.y }] };
            this.isPenDown = true;
        } else if (dot.dotType === 1) { // Move
            if (!this.isPenDown || !this.currentStroke) {
                 this.currentStroke = { points: [{ x: dot.x, y: dot.y }] };
                 this.isPenDown = true;
            }
            this.currentStroke.points.push({ x: dot.x, y: dot.y });
        } else if (dot.dotType === 2) { // Up
            if (this.isPenDown && this.currentStroke) {
                this.currentStroke.points.push({ x: dot.x, y: dot.y });
                this.strokeHistory.push(this.currentStroke);
                this.saveHistory();
                
                // Trigger check
                if(this.onTrigger) this.onTrigger(this.currentStroke);
                
                this.currentStroke = null;
            }
            this.isPenDown = false;
        }
        
        if(this.onRedraw) this.onRedraw();
    }

    handlePage(dot) {
        try {
            const section = dot.section || (dot.pageInfo && dot.pageInfo.section);
            const owner = dot.owner || (dot.pageInfo && dot.pageInfo.owner);
            const note = dot.note || dot.book || (dot.pageInfo && (dot.pageInfo.note || dot.pageInfo.book));
            const page = dot.page || (dot.pageInfo && dot.pageInfo.page);
            
            const pageId = `${section}_${owner}_${note}_${page}`;

            if (this.currentPageId !== pageId) {
                console.log(`Page switched: ${this.currentPageId} -> ${pageId}`);
                if(this.onStatusChange) this.onStatusChange(`Switching to Page ${note}.${page}...`);
                
                // Finish current stroke on old page
                if (this.currentStroke) {
                    this.strokeHistory.push(this.currentStroke);
                    this.currentStroke = null;
                    this.isPenDown = false;
                }

                // Save old
                if (this.currentPageId) {
                    this.notebookData[this.currentPageId] = this.strokeHistory;
                } else {
                    // Migration
                    if (this.strokeHistory.length > 0) {
                         this.notebookData[pageId] = this.strokeHistory;
                    }
                }
                
                // Switch
                this.currentPageId = pageId;
                localStorage.setItem('lastPageId', this.currentPageId);
                
                // Load new
                if (this.notebookData[pageId]) {
                    this.strokeHistory = this.notebookData[pageId];
                } else {
                    this.strokeHistory = [];
                    this.notebookData[pageId] = this.strokeHistory;
                }
                
                this.saveHistory();
                if(this.onRedraw) this.onRedraw();
                if(this.onStatusChange) this.onStatusChange(`Page: ${note}.${page}`);
            }
        } catch (e) {
            console.error("Error in handlePage:", e);
        } finally {
            // Restore callback
            setTimeout(() => {
                PenHelper.dotCallback = this.handleDot.bind(this);
                // Process buffered
                try {
                    const section = dot.section || (dot.pageInfo && dot.pageInfo.section);
                    const owner = dot.owner || (dot.pageInfo && dot.pageInfo.owner);
                    const note = dot.note || dot.book || (dot.pageInfo && (dot.pageInfo.note || dot.pageInfo.book));
                    const page = dot.page || (dot.pageInfo && dot.pageInfo.page);
                    const pageId = `${section}_${owner}_${note}_${page}`;
                    
                    const buffered = PenHelper.dotStorage[pageId];
                    if (buffered && buffered.length > 0) {
                        const mac = PenHelper.mac || "unknown";
                        buffered.forEach(d => this.handleDot(mac, d)); 
                        PenHelper.dotStorage[pageId] = [];
                    }
                } catch (err) {}
            }, 0);
        }
    }

    clearCanvas() {
        this.strokeHistory = [];
        this.currentStroke = null;
        if (this.currentPageId) {
            this.notebookData[this.currentPageId] = [];
            localStorage.setItem('notebookData', JSON.stringify(this.notebookData));
        }
        localStorage.removeItem('strokeHistory');
        if(this.onRedraw) this.onRedraw();
    }

    setCanvasSize(width, height) {
        this.viewWidth = width;
        this.viewHeight = height;
    }

    mapToScreen(x, y) {
        if (!this.viewWidth || !this.viewHeight) return { x: 0, y: 0 };
        
        const p = 0.01;
        const uw = this.viewWidth * (1 - 2 * p);
        const uh = this.viewHeight * (1 - 2 * p);
        const pw = Math.max(this.paperSize.width, 0.0001); 
        const ph = Math.max(this.paperSize.height, 0.0001);
        const scale = Math.min(uw / pw, uh / ph);
        const ox = (this.viewWidth - (pw * scale)) / 2;
        const oy = (this.viewHeight - (ph * scale)) / 2;
        
        return {
            x: (x - this.paperSize.Xmin) * scale + ox,
            y: (y - this.paperSize.Ymin) * scale + oy
        };
    }
}

module.exports = PenManager;
