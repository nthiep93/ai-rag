/**
 * FILE LOADER MODULE
 * Chức năng: Đọc markdown/txt files từ ./data folder
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Load all .md / .txt files từ data folder
 */
export function loadFilesFromDirectory(dirPath: string): Map<string, string> {
  const docs = new Map<string, string>();

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
  } catch (error) {
    console.error("File loading error:", error);
    throw error;
  }
}
