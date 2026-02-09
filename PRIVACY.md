# Privacy Policy for InkLogic

**Last Updated: February 9, 2026**

InkLogic ("the App") is a prototype application designed to connect Neo Smartpen devices to Google Gemini AI. This Privacy Policy describes how your information is handled.

## 1. Information Collection and Use

### 1.1 Local Storage
InkLogic is designed with a "local-first" approach. The following data is stored exclusively on your device using browser-based storage (LocalStorage and IndexedDB):
- **Settings**: Your Gemini API Key, preferred model, and custom prompt settings.
- **Stroke Data**: Digital ink data captured from your Smartpen.
- **History**: A history of your sketches (inputs) and the AI-generated responses (text and images).

This data stays on your device and is not uploaded to any servers managed by the App developer.

### 1.2 Google Gemini AI Integration
To provide AI features, the App sends your sketches and prompts to Google's Gemini API. 
- **Data Sent**: When you trigger an AI action, a snapshot of your current sketch and your text prompt is sent directly from your device to Google.
- **API Key**: You provide your own Gemini API Key. The App does not see or store this key anywhere other than your device's local storage.
- **Third-Party Processing**: Use of the Gemini AI features is subject to [Google's Privacy Policy](https://policies.google.com/privacy) and the terms of the Google AI Studio/Gemini API.

### 1.3 Bluetooth Data
The App uses Bluetooth Low Energy (BLE) to communicate with your Neo Smartpen. Bluetooth data is processed in real-time to render your drawing. No location data or identifying device information is collected or transmitted by the App, although the underlying Android operating system may require location permissions to enable Bluetooth scanning.

## 2. Data Retention and Deletion

All data remains on your device until you choose to delete it. You can clear all app data (including your API key and history) at any time through the "Clear App Data" button in the Settings menu or by clearing the app's cache in your Android system settings.

## 3. Third-Party Services

InkLogic uses the following third-party libraries and services:
- **Google Gemini API**: For AI content generation.
- **Capacitor Plugins**: For native device features like Bluetooth, Filesystem access, and Sharing.

## 4. Children's Privacy

The App does not knowingly collect any personally identifiable information from children. Since all data is stored locally on the user's device, the developer has no access to user data.

## 5. Changes to This Privacy Policy

We may update our Privacy Policy from time to time. You are advised to review the README or this document periodically for any changes.

## 6. Contact Us

If you have any questions about this Privacy Policy, you can reach out via the project's GitHub repository.
