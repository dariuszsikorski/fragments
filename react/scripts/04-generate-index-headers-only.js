#!/usr/bin/env node

/**
 * Phase 4: Generate Index of Contents (Pure Headers Only)
 * Extracts ONLY markdown headers (#, ##, ###, ####) from all .md files
 * Filters out non-header content like "Note", "Pitfall", "Deep Dive", etc.
 * Creates clean table of contents with proper hierarchy
 * Usage: node 04-generate-index-headers-only.js
 */

import fs from 'fs/promises';
import path from 'path';

const MARKDOWN_DIR = './react-reference/markdown';
const OUTPUT_FILE = '00-0-index-of-contents.md';

// Words to filter out (not actual content headers)
const FILTER_OUT_WORDS = [
  'note', 'pitfall', 'deep dive', 'experimental feature', 'deprecated',
  'under construction', 'warning', 'caution', 'tip', 'info'
];

class Logger {
  static info(msg) {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`);
  }
  
  static success(msg) {
    console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`);
  }
  
  static error(msg) {
    console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`);
  }
  
  static step(msg) {
    console.log(`[STEP] ${new Date().toISOString()} - ${msg}`);
  }
  
  static progress(current, total, title) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${title}`);
  }
}

class PureHeadersIndexGenerator {
  
  async getMarkdownFiles() {
    try {
      Logger.step('Scanning for markdown files');
      
      const files = await fs.readdir(MARKDOWN_DIR);
      const markdownFiles = files
        .filter(f => f.endsWith('.md') && f !== OUTPUT_FILE)
        .sort(); // Maintain alphabetical order
      
      if (markdownFiles.length === 0) {
        throw new Error('No markdown files found');
      }
      
      Logger.success(`Found ${markdownFiles.length} markdown files to process`);
      return markdownFiles;
    } catch (error) {
      Logger.error(`Failed to scan markdown files: ${error.message}`);
      throw error;
    }
  }

  isValidHeader(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Filter out common non-content words
    if (FILTER_OUT_WORDS.some(word => lowerText === word)) {
      return false;
    }
    
    // Filter out very short headers (likely navigation elements)
    if (lowerText.length < 3) {
      return false;
    }
    
    // Keep headers that look like actual content
    return true;
  }

  async extractHeadersFromMarkdown(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const headers = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Only match lines that start with # (headers)
        if (trimmed.match(/^#{1,6}\s+.+$/)) {
          const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
          if (match) {
            const level = match[1].length;
            let text = match[2].trim();
            
            // Remove markdown links and other formatting
            text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Remove markdown links
            text = text.replace(/`([^`]+)`/g, '$1'); // Remove code formatting
            text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold
            text = text.replace(/\*([^*]+)\*/g, '$1'); // Remove italic
            text = text.replace(/~~([^~]+)~~/g, '$1'); // Remove strikethrough
            
            if (this.isValidHeader(text)) {
              headers.push({ level, text });
            }
          }
        }
      }
      
      return headers;
    } catch (error) {
      Logger.error(`Failed to extract headers from ${filePath}: ${error.message}`);
      return [];
    }
  }

  async extractFileMetadata(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let title = '';
      let url = '';
      let pathInfo = '';
      
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const titleMatch = frontmatter.match(/^title:\s*"(.+)"$/m);
        const urlMatch = frontmatter.match(/^url:\s*(.+)$/m);
        const pathMatch = frontmatter.match(/^path:\s*(.+)$/m);
        
        if (titleMatch) title = titleMatch[1];
        if (urlMatch) url = urlMatch[1];
        if (pathMatch) pathInfo = pathMatch[1];
      }
      
      return { title, url, path: pathInfo };
    } catch (error) {
      Logger.error(`Failed to extract metadata from ${filePath}: ${error.message}`);
      return { title: '', url: '', path: '' };
    }
  }

  async generatePureHeadersIndex() {
    try {
      Logger.step('Starting pure headers-only index generation');
      
      const markdownFiles = await this.getMarkdownFiles();
      const timestamp = new Date().toISOString();
      
      let indexContent = `---
title: "React Documentation - Index of Contents (Pure Headers)"
generated: ${timestamp}
total_pages: ${markdownFiles.length}
---

# Index of Contents - React Documentation (Pure Headers)

> **Complete table of contents with ONLY pure content headers from ${markdownFiles.length} documentation pages**
> 
> **Generated:** ${timestamp}  
> **Source:** [React.dev Reference](https://react.dev/reference)
> **Filtered:** Excludes meta-content like "Note", "Pitfall", "Deep Dive", etc.

---

`;

      let totalHeaders = 0;

      // Process each markdown file
      for (let i = 0; i < markdownFiles.length; i++) {
        const filename = markdownFiles[i];
        const filePath = path.join(MARKDOWN_DIR, filename);
        
        Logger.progress(i + 1, markdownFiles.length, filename);
        
        const metadata = await this.extractFileMetadata(filePath);
        const headers = await this.extractHeadersFromMarkdown(filePath);
        
        if (headers.length > 0) {
          // Add file section
          indexContent += `## ${metadata.title || filename}\n\n`;
          indexContent += `> **File:** [\`${filename}\`](${filename})  \n`;
          if (metadata.url) indexContent += `> **URL:** [${metadata.url}](${metadata.url})  \n`;
          if (metadata.path) indexContent += `> **Path:** \`${metadata.path}\`\n`;
          indexContent += `> **Headers:** ${headers.length}\n\n`;
          
          // Add headers with proper indentation
          headers.forEach(header => {
            const indent = '  '.repeat(header.level - 1);
            indexContent += `${indent}- ${header.text}\n`;
          });
          
          indexContent += '\n';
          totalHeaders += headers.length;
        }
      }

      // Add footer with statistics
      indexContent += `---\n\n## Statistics\n\n`;
      indexContent += `- **Total Pages:** ${markdownFiles.length}\n`;
      indexContent += `- **Total Headers:** ${totalHeaders}\n`;
      indexContent += `- **Generated:** ${timestamp}\n`;
      indexContent += `- **Source:** React.dev Reference Documentation\n`;
      indexContent += `- **Format:** Pure Headers Only (# ## ### ####)\n`;
      indexContent += `- **Filtered Out:** Meta-content, navigation elements, notes\n\n`;
      indexContent += `*This index contains only content headers for clean documentation navigation.*\n`;

      // Write the new index file
      const outputPath = path.join(MARKDOWN_DIR, OUTPUT_FILE);
      await fs.writeFile(outputPath, indexContent, 'utf8');
      
      Logger.success(`Pure headers index created: ${OUTPUT_FILE}`);
      Logger.info(`File location: ${outputPath}`);
      Logger.info(`Total pages processed: ${markdownFiles.length}`);
      Logger.info(`Total headers extracted: ${totalHeaders}`);
      
    } catch (error) {
      Logger.error(`Index generation failed: ${error.message}`);
      throw error;
    }
  }
}

async function main() {
  Logger.info('React Documentation - Pure Headers Index Generator');
  
  try {
    const generator = new PureHeadersIndexGenerator();
    await generator.generatePureHeadersIndex();
    Logger.success('Pure headers index generation completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
