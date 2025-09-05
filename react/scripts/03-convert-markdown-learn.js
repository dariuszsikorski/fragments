#!/usr/bin/env node

/**
 * Phase 3: Convert to Markdown (Learn Section)
 * Converts HTML files to markdown using Mozilla Reader Mode + Turndown (20 concurrent)
 * Input: /html/*.html files | Output: /markdown/*.md files + INDEX.md
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = './react-learn';
const HTML_DIR = './react-learn/html';
const MARKDOWN_DIR = './react-learn/markdown';
const CONCURRENT_LIMIT = 20;

// Naming Functions for Learn Section
const CHAPTER_MAPPING = {
  '/learn': { number: 1, name: 'Get Started' },
  '/learn/tutorial-tic-tac-toe': { number: 1, name: 'Get Started' },
  '/learn/thinking-in-react': { number: 1, name: 'Get Started' },
  '/learn/installation': { number: 1, name: 'Get Started' },
  '/learn/setup': { number: 1, name: 'Get Started' },
  '/learn/react-compiler': { number: 1, name: 'Get Started' },
  '/learn/describing-the-ui': { number: 2, name: 'Learn React' },
  '/learn/adding-interactivity': { number: 2, name: 'Learn React' },
  '/learn/managing-state': { number: 2, name: 'Learn React' },
  '/learn/escape-hatches': { number: 2, name: 'Learn React' }
};

const SECTION_PRIORITY = {
  'quick-start': 1,
  'tutorial': 2,
  'thinking': 3,
  'installation': 4,
  'setup': 5,
  'compiler': 6,
  'describing': 7,
  'adding': 8,
  'managing': 9,
  'escape': 10
};

function getChapterInfo(href) {
  // Find the most specific match
  const exactMatch = CHAPTER_MAPPING[href];
  if (exactMatch) return exactMatch;
  
  // Check for partial matches
  for (const [path, chapter] of Object.entries(CHAPTER_MAPPING)) {
    if (href.startsWith(path)) {
      return chapter;
    }
  }
  
  return { number: 99, name: 'Other' };
}

function getSectionPriority(text, href) {
  const lowerText = text.toLowerCase();
  const lowerHref = href.toLowerCase();
  
  for (const [keyword, priority] of Object.entries(SECTION_PRIORITY)) {
    if (lowerText.includes(keyword) || lowerHref.includes(keyword)) {
      return priority;
    }
  }
  
  return 1000 + lowerText.charCodeAt(0);
}

function cleanTitle(text) {
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function organizeLinks(links) {
  const chapters = {};
  
  links.forEach(link => {
    const chapterInfo = getChapterInfo(link.href);
    const chapterNum = chapterInfo.number;
    
    if (!chapters[chapterNum]) {
      chapters[chapterNum] = {
        info: chapterInfo,
        sections: []
      };
    }
    
    chapters[chapterNum].sections.push({
      ...link,
      priority: getSectionPriority(link.text, link.href)
    });
  });
  
  Object.values(chapters).forEach(chapter => {
    chapter.sections.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.text.localeCompare(b.text);
    });
  });
  
  return chapters;
}

function generateChapterSectionFilename(link, organizedLinks) {
  const chapterInfo = getChapterInfo(link.href);
  const chapter = organizedLinks[chapterInfo.number];
  
  if (!chapter) {
    return cleanTitle(link.text);
  }
  
  const sectionIndex = chapter.sections.findIndex(section => 
    section.href === link.href
  );
  
  if (sectionIndex === -1) {
    return cleanTitle(link.text);
  }
  
  const chapterNum = String(chapterInfo.number).padStart(2, '0');
  const sectionNum = String(sectionIndex + 1).padStart(2, '0');
  const title = cleanTitle(link.text);
  
  return `${chapterNum}-${sectionNum}-${title}`;
}

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
  
  static progress(current, total, filename) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${filename}`);
  }
  
  static batch(batch, totalBatches, batchSize) {
    console.log(`[BATCH] Converting batch ${batch}/${totalBatches} (${batchSize} files)`);
  }
}

class MarkdownConverter {
  constructor() {
    this.organizedLinks = null;
    this.turndownService = null;
    this.initTurndown();
  }

  initTurndown() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    });
    
    // Custom rules for better markdown
    this.turndownService.addRule('codeBlocks', {
      filter: 'pre',
      replacement: (content, node) => {
        const codeElement = node.querySelector('code');
        const language = codeElement ? codeElement.className.replace('language-', '') : '';
        return '\n```' + language + '\n' + content + '\n```\n';
      }
    });
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.mkdir(MARKDOWN_DIR, { recursive: true });
      Logger.info('Output directories ready');
    } catch (error) {
      Logger.error(`Failed to create directories: ${error.message}`);
      throw error;
    }
  }

  async loadLinksFromFile() {
    try {
      Logger.step('Loading links from JSON file');
      
      const filePath = path.join(OUTPUT_DIR, 'react-learn-links.json');
      const content = await fs.readFile(filePath, 'utf8');
      const links = JSON.parse(content);
      
      this.organizedLinks = organizeLinks(links);
      
      Logger.success(`Loaded ${links.length} links for organization`);
      return links;
    } catch (error) {
      Logger.error(`Failed to load links: ${error.message}`);
      throw error;
    }
  }

  async getHtmlFiles() {
    try {
      const files = await fs.readdir(HTML_DIR);
      const htmlFiles = files.filter(file => file.endsWith('.html'));
      
      Logger.success(`Found ${htmlFiles.length} HTML files to convert`);
      return htmlFiles;
    } catch (error) {
      Logger.error(`Failed to read HTML directory: ${error.message}`);
      throw error;
    }
  }

  async convertSingleFile(htmlFile, index, total) {
    try {
      Logger.progress(index + 1, total, htmlFile);
      
      const htmlPath = path.join(HTML_DIR, htmlFile);
      const htmlContent = await fs.readFile(htmlPath, 'utf8');
      
      // Use JSDOM to parse HTML
      const dom = new JSDOM(htmlContent);
      
      // Use Readability to extract main content
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      
      if (!article || !article.content) {
        throw new Error('Failed to extract readable content');
      }
      
      // Convert to markdown
      const markdown = this.turndownService.turndown(article.content);
      
      if (!markdown || markdown.trim().length < 100) {
        throw new Error('Markdown conversion resulted in minimal content');
      }
      
      // Generate output filename (remove .html, add .md)
      const markdownFile = htmlFile.replace('.html', '.md');
      const markdownPath = path.join(MARKDOWN_DIR, markdownFile);
      
      // Add title and metadata
      const title = article.title || markdownFile.replace('.md', '').replace(/-/g, ' ');
      const finalMarkdown = `# ${title}\n\n${markdown}`;
      
      await fs.writeFile(markdownPath, finalMarkdown, 'utf8');
      
      Logger.success(`Converted: ${markdownFile} (${finalMarkdown.length} chars)`);
      
      return {
        htmlFile,
        markdownFile,
        title,
        size: finalMarkdown.length,
        success: true
      };
      
    } catch (error) {
      Logger.error(`Failed to convert ${htmlFile}: ${error.message}`);
      return {
        htmlFile,
        error: error.message,
        success: false
      };
    }
  }

  async processBatch(batch, batchNumber, totalBatches) {
    Logger.batch(batchNumber, totalBatches, batch.length);
    
    const conversionPromises = batch.map((htmlFile, index) => {
      const globalIndex = (batchNumber - 1) * CONCURRENT_LIMIT + index;
      return this.convertSingleFile(htmlFile, globalIndex, batch.totalFiles);
    });
    
    const results = await Promise.allSettled(conversionPromises);
    
    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value && r.value.success)
      .map(r => r.value);
    
    const failed = results
      .filter(r => r.status === 'rejected' || (r.value && !r.value.success))
      .length;
    
    if (failed > 0) {
      Logger.error(`Batch ${batchNumber}: ${failed} files failed to convert`);
    }
    
    Logger.success(`Batch ${batchNumber}: ${successful.length} files converted successfully`);
    return successful;
  }

  async generateIndex(results) {
    try {
      Logger.step('Generating index of contents');
      
      const links = await this.loadLinksFromFile();
      const chapters = this.organizedLinks;
      
      let indexContent = '# React Learn Documentation\n\n';
      indexContent += 'Complete markdown documentation for React Learn section.\n\n';
      indexContent += `Generated on: ${new Date().toISOString()}\n\n`;
      
      // Generate table of contents by chapter
      Object.keys(chapters)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(chapterNum => {
          const chapter = chapters[chapterNum];
          indexContent += `## ${chapterNum}. ${chapter.info.name}\n\n`;
          
          chapter.sections.forEach((section, index) => {
            const filename = generateChapterSectionFilename(section, chapters);
            const markdownFile = `${filename}.md`;
            
            // Check if file was successfully converted
            const result = results.find(r => r.markdownFile === markdownFile);
            if (result) {
              indexContent += `${index + 1}. [${section.text}](./${markdownFile})\n`;
            } else {
              indexContent += `${index + 1}. ${section.text} *(conversion failed)*\n`;
            }
          });
          
          indexContent += '\n';
        });
      
      const indexPath = path.join(MARKDOWN_DIR, '00-0-index-of-contents.md');
      await fs.writeFile(indexPath, indexContent, 'utf8');
      
      Logger.success('Index of contents generated: 00-0-index-of-contents.md');
      
    } catch (error) {
      Logger.error(`Failed to generate index: ${error.message}`);
    }
  }

  async convertAllFiles() {
    try {
      await this.ensureDirectories();
      const htmlFiles = await this.getHtmlFiles();
      
      if (htmlFiles.length === 0) {
        Logger.error('No HTML files found to convert');
        return;
      }
      
      // Split into batches for concurrent processing
      const batches = [];
      for (let i = 0; i < htmlFiles.length; i += CONCURRENT_LIMIT) {
        const batch = htmlFiles.slice(i, i + CONCURRENT_LIMIT);
        batch.totalFiles = htmlFiles.length;
        batches.push(batch);
      }
      
      Logger.info(`Starting conversion of ${htmlFiles.length} files in ${batches.length} batches`);
      
      const allResults = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batchResults = await this.processBatch(batches[i], i + 1, batches.length);
        allResults.push(...batchResults);
      }
      
      const successCount = allResults.length;
      const totalSize = allResults.reduce((sum, result) => sum + result.size, 0);
      
      Logger.success(`Conversion completed: ${successCount}/${htmlFiles.length} files`);
      Logger.info(`Total markdown size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Generate index
      await this.generateIndex(allResults);
      
    } catch (error) {
      Logger.error(`Bulk conversion failed: ${error.message}`);
      throw error;
    }
  }
}

async function main() {
  Logger.info('Starting React Learn Markdown Converter');
  
  try {
    const converter = new MarkdownConverter();
    await converter.convertAllFiles();
    Logger.success('Markdown conversion phase completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
