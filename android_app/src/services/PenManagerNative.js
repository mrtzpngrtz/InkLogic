// PenManagerNative.js - Native Bluetooth via Capacitor plugin
import { BleClient } from '@capacitor-community/bluetooth-le';
import PenController from 'web_pen_sdk/dist/PenCotroller/PenController';
import * as PenMessageTypeModule from 'web_pen_sdk/dist/API/PenMessageType';

const PenMessageType = PenMessageTypeModule.default || PenMessageTypeModule;

// Bluetooth UUIDs from web_pen_sdk
const PEN_SERVICE_UUID_128 = "4f99f138-9d53-5bfa-9e50-b147491afe68";
const PEN_CHARACTERISTICS_NOTIFICATION_UUID_128 = "64cd86b1-2256-5aeb-9f04-2caf6c60ae57";
const PEN_CHARACTERISTICS_WRITE_UUID_128 = "8bc8cc7d-88ca-56b0-af9a-9bf514d0d61a";

export class PenManagerNative {
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
        this.penController = null;
        this.connectedDevice = null;
        
        // Callbacks
        this.onRedraw = null;
        this.onStatusChange = null;
        this.onDebugInfo = null;
        this.onTrigger = null;
        this.onStrokeUpdate = null;
    }

    async init() {
        try {
            await BleClient.initialize();
            console.log("BLE Client initialized");
            this.loadHistory();
        } catch (error) {
            console.error("Failed to initialize BLE:", error);
            throw error;
        }
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
            if(this.onStatusChange) this.onStatusChange("Initializing Bluetooth...");
            
            // Ensure BLE is initialized
            await BleClient.initialize();
            
            if(this.onStatusChange) this.onStatusChange("Scanning for pen...");
            
            // Request device with Neo Smartpen service UUID
            const device = await BleClient.requestDevice({
                services: [PEN_SERVICE_UUID_128],
                optionalServices: []
            });

            if(this.onStatusChange) this.onStatusChange("Connecting...");
            
            // Connect to device
            await BleClient.connect(device.deviceId, (deviceId) => {
                console.log(`Disconnected from device ${deviceId}`);
                this.handleDisconnect();
            });

            this.connectedDevice = device;
            console.log("Connected to pen:", device.deviceId);

            // Setup PenController
            this.setupPenController(device);

            // Start notifications
            await BleClient.startNotifications(
                device.deviceId,
                PEN_SERVICE_UUID_128,
                PEN_CHARACTERISTICS_NOTIFICATION_UUID_128,
                (value) => this.handleNotification(value)
            );

            // Trigger connection success
            if (this.penController) {
                this.penController.OnConnected();
            }

            if(this.onStatusChange) this.onStatusChange("Pen connected");
            
        } catch (error) {
            console.error("Connection error:", error);
            if(this.onStatusChange) this.onStatusChange("Connection failed: " + error.message);
            throw error;
        }
    }

    setupPenController(device) {
        this.penController = new PenController();
        this.penController.device = { id: device.deviceId, name: device.name };

        // Setup write function
        this.penController.addWrite(async (data) => {
            try {
                const dataView = new DataView(new ArrayBuffer(data.length));
                for (let i = 0; i < data.length; i++) {
                    dataView.setUint8(i, data[i]);
                }
                
                await BleClient.write(
                    device.deviceId,
                    PEN_SERVICE_UUID_128,
                    PEN_CHARACTERISTICS_WRITE_UUID_128,
                    dataView
                );
                console.log("Wrote command:", "0x" + data[1].toString(16));
            } catch (error) {
                console.error("Write error:", error);
            }
        });

        // Setup callbacks
        this.penController.addCallback(
            this.handleDot.bind(this),
            this.handleMessage.bind(this)
        );
    }

    handleNotification(value) {
        if (!this.penController) return;
        
        // Convert DataView to array
        const data = [];
        for (let i = 0; i < value.byteLength; i++) {
            data.push(value.getUint8(i));
        }
        
        // Feed to PenController
        this.penController.putData(data);
    }

    handleMessage(controller, type, args) {
        console.log("Pen message:", type, args);
        
        if (type === PenMessageType.PEN_AUTHORIZED) {
            console.log("Pen authorized");
            if (controller.RequestAvailableNotes) {
                controller.RequestAvailableNotes();
            }
        }
        
        if (this.onStatusChange) {
            const mac = controller.info?.MacAddress || "unknown";
            this.onStatusChange(`Pen event: ${type}`);
        }
    }

    handleDot(controller, dot) {
        if (dot.x <= 0.1 && dot.y <= 0.1) return;

        const section = dot.section || (dot.pageInfo && dot.pageInfo.section);
        const owner =  dot.owner || (dot.pageInfo && dot.pageInfo.owner);
        const note = dot.note || dot.book || (dot.pageInfo && (dot.pageInfo.note || dot.pageInfo.book));
        const page = dot.page || (dot.pageInfo && dot.pageInfo.page);
        
        const pageId = `${section}_${owner}_${note}_${page}`;
        
        if(this.onDebugInfo) {
            this.onDebugInfo(`Page: ${note}.${page} | X: ${dot.x.toFixed(2)}, Y: ${dot.y.toFixed(2)}`);
        }

        // Handle page changes
        if (this.currentPageId && this.currentPageId !== pageId) {
            this.handlePageChange(pageId);
        }
        if (!this.currentPageId) {
            this.currentPageId = pageId;
            localStorage.setItem('lastPageId', this.currentPageId);
        }

        // Handle dot types
        if (dot.dotType === 0 || dot.DotType === 0) { // Pen down
            this.currentStroke = { points: [{ x: dot.x, y: dot.y }] };
            this.isPenDown = true;
            
            // Live update
            if(this.onStrokeUpdate) {
                this.onStrokeUpdate(this.currentStroke);
            }
        } else if (dot.dotType === 1 || dot.DotType === 1) { // Pen move
            if (!this.isPenDown || !this.currentStroke) {
                this.currentStroke = { points: [{ x: dot.x, y: dot.y }] };
                this.isPenDown = true;
            }
            this.currentStroke.points.push({ x: dot.x, y: dot.y });
            
            // Live update
            if(this.onStrokeUpdate) {
                this.onStrokeUpdate(this.currentStroke);
            }
        } else if (dot.dotType === 2 || dot.DotType === 2) { // Pen up
            if (this.isPenDown && this.currentStroke) {
                this.currentStroke.points.push({ x: dot.x, y: dot.y });
                this.strokeHistory.push(this.currentStroke);
                this.saveHistory();
                
                // Final live update
                if(this.onStrokeUpdate) {
                    this.onStrokeUpdate(this.currentStroke);
                }
                
                if(this.onTrigger) {
                    this.onTrigger(this.currentStroke);
                }
                
                this.currentStroke = null;
            }
            this.isPenDown = false;
        }
        
        if(this.onRedraw) {
            this.onRedraw();
        }
    }

    handlePageChange(newPageId) {
        console.log(`Page switched: ${this.currentPageId} -> ${newPageId}`);
        
        if (this.currentStroke) {
            this.strokeHistory.push(this.currentStroke);
            this.currentStroke = null;
            this.isPenDown = false;
        }

        // Save current page
        if (this.currentPageId) {
            this.notebookData[this.currentPageId] = this.strokeHistory;
        }
        
        // Load new page
        this.currentPageId = newPageId;
        localStorage.setItem('lastPageId', this.currentPageId);
        
        if (this.notebookData[newPageId]) {
            this.strokeHistory = this.notebookData[newPageId];
        } else {
            this.strokeHistory = [];
            this.notebookData[newPageId] = this.strokeHistory;
        }
        
        this.saveHistory();
        if(this.onRedraw) this.onRedraw();
    }

    handleDisconnect() {
        console.log("Pen disconnected");
        this.connectedDevice = null;
        this.penController = null;
        if(this.onStatusChange) {
            this.onStatusChange("Pen disconnected");
        }
    }

    async disconnect() {
        if (this.connectedDevice) {
            try {
                await BleClient.disconnect(this.connectedDevice.deviceId);
                this.handleDisconnect();
            } catch (error) {
                console.error("Disconnect error:", error);
            }
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
