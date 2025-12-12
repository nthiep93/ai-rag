"use strict";
/**
 * FILE LOADER MODULE
 * Chức năng: Đọc markdown/txt files từ ./data folder
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFilesFromDirectory = loadFilesFromDirectory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Load all .md / .txt files từ data folder
 */
function loadFilesFromDirectory(dirPath) {
    const docs = new Map();
    try {
        if (!fs.existsSync(dirPath)) {
            console.warn(`Directory not found: ${dirPath}`);
            return docs;
        }
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            if (file.endsWith(".md") || file.endsWith(".txt")) {
                const filePath = path.join(dirPath, file);
                const content = fs.readFileSync(filePath, "utf-8");
                docs.set(file, content);
                console.log(`✅ Loaded: ${file}`);
            }
        }
        console.log(`📚 Total files loaded: ${docs.size}`);
        return docs;
    }
    catch (error) {
        console.error("File loading error:", error);
        throw error;
    }
}
