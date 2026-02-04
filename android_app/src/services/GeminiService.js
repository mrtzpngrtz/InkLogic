// GeminiService.js - Browser-compatible version
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiService {
    constructor() {
        this.apiKey = null;
        this.modelName = 'gemini-3-flash-preview';
        this.onStatusChange = null;
        this.onResult = null;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    setModel(model) {
        this.modelName = model;
    }

    cleanPrompt(text) {
        if (!text) return text;
        return text;
    }

    async generate(mode, promptText, imageBase64, options = {}) {
        if (!this.apiKey) {
            throw new Error("Please enter a Gemini API Key.");
        }

        const effectiveModel = mode === 'image' ? 'gemini-3-pro-image-preview' : this.modelName;
        
        if (this.onStatusChange) {
            const action = mode === 'image' ? "Generating Image" : "Generating Response";
            this.onStatusChange(`${action}...`);
        }

        try {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            const model = genAI.getGenerativeModel({ model: effectiveModel, apiVersion: "v1beta" });

            // Save input as data URL for browser
            const inputUrl = `data:image/png;base64,${imageBase64}`;

            const imagePart = {
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/png"
                }
            };

            const result = await model.generateContent([this.cleanPrompt(promptText), imagePart]);
            const response = await result.response;

            if (mode === 'image') {
                return this.handleImageResponse(response, inputUrl);
            } else {
                return this.handleTextResponse(response, inputUrl);
            }

        } catch (error) {
            console.error("Gemini Error:", error);
            throw error;
        }
    }

    handleImageResponse(response, inputUrl) {
        if (response.candidates && response.candidates[0]?.content?.parts) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
                if (part.inlineData) {
                    const imgData = part.inlineData.data;
                    const mime = part.inlineData.mimeType || 'image/png';
                    
                    // Return as data URL for browser
                    const resultItem = { 
                        type: 'image', 
                        url: `data:${mime};base64,${imgData}`,
                        inputUrl: inputUrl,
                        timestamp: new Date().toISOString()
                    };
                    return Promise.resolve(resultItem);
                }
            }
        }
        throw new Error("No image returned");
    }

    handleTextResponse(response, inputUrl) {
        const text = response.text();
        const resultItem = { 
            type: 'text', 
            content: text,
            inputUrl: inputUrl,
            timestamp: new Date().toISOString()
        };
        return Promise.resolve(resultItem);
    }
}
