// GeminiService.js - Handles communication with Google Gemini API
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

class GeminiService {
    constructor(outputDir) {
        this.outputDir = outputDir;
        this.apiKey = null;
        this.modelName = 'gemini-3-flash-preview'; // Default
        this.onStatusChange = null;
        this.onResult = null; // (result) => void
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

            // Save Input Sketch
            const timestampId = new Date().toISOString().replace(/[:.]/g, '-');
            const inputFilename = `input_${timestampId}.png`;
            const inputFilePath = path.join(this.outputDir, inputFilename);
            
            fs.writeFile(inputFilePath, imageBase64, 'base64', (err) => {
                if (err) console.error("Failed to save input sketch:", err);
            });
            const inputUrl = `/images/${inputFilename}`;

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
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `image_${timestamp}.png`;
                    const filePath = path.join(this.outputDir, filename);
                    
                    // Return promise to handle async save
                    return new Promise((resolve, reject) => {
                        fs.writeFile(filePath, imgData, 'base64', (err) => {
                            if (err) {
                                console.error("Failed to save image:", err);
                                reject(err);
                            } else {
                                const resultItem = { 
                                    type: 'image', 
                                    url: `/images/${filename}`,
                                    inputUrl: inputUrl,
                                    timestamp: new Date().toISOString()
                                };
                                resolve(resultItem);
                            }
                        });
                    });
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

module.exports = GeminiService;
