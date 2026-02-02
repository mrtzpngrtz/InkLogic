const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    title: 'InkLogic',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableWebSQL: false
    }
  });

  mainWindow = win;
  win.loadFile('index.html');

  // Bluetooth Device Selection Handler
  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault(); // Prevent default behavior
    console.log('Bluetooth devices found:', deviceList);
    // Send list to renderer to show UI
    win.webContents.send('bluetooth-device-list', deviceList);

    // Set up a one-time listener for the selection response
    ipcMain.once('bluetooth-device-selected', (event, deviceId) => {
      if (deviceId) {
        callback(deviceId);
      } else {
        callback(''); // Cancelled
      }
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
