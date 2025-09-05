#!/usr/bin/env node

/**
 * Phase 2: Download HTML Pages (Unified)
 * Downloads original HTML content from React Reference OR Learn pages (20 concurrent)
 * Input: react-{mode}-links.json | Output: /{mode}/html/{filename}.html files
 * 
 * Usage: node 02-download-html-unified.js --mode <reference|learn>
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CONCURRENT_LIMIT = 20;
const DELAY_BETWEEN_BATCHES = 2000;

// Mode-specific configurations
const MODE_CONFIGS = {
  reference: {
    outputDir: './react-reference',
    inputFile: 'react-reference-links.json',
    chapterMapping: {
      '/reference/react': { number: 1, name: 'React Core' },
      '/reference/react-dom': { number: 2, name: 'React DOM' },
      '/reference/react-compiler': { number: 3, name: 'React Compiler' },
      '/reference/rsc': { number: 4, name: 'React Server Components' },
      '/reference/rules': { number: 5, name: 'Rules of React' }
    },
    sectionPriority: {
      'overview': 1,
      'hooks': 2,
      'components': 3,
      'apis': 4,
      'client': 5,
      'server': 6
    }
  },
  learn: {
    outputDir: './react-learn',
    inputFile: 'react-learn-links.json',
    chapterMapping: {
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
    },
    sectionPriority: {
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
    }
  }
};

function printUsage() {
  console.log(`
Usage: node 02-download-html-unified.js --mode <mode>

Download HTML pages from React documentation.

Options:
  --mode <mode>     Download mode (required)
                    Available modes: reference, learn
  --help, -h        Show this help message

Examples:
  node 02-download-html-unified.js --mode reference
  node 02-download-html-unified.js --mode learn

Output:
  reference mode: Downloads to ./react-reference/html/
  learn mode:     Downloads to ./react-learn/html/
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  const modeIndex = args.indexOf('--mode');
  if (modeIndex === -1 || modeIndex === args.length - 1) {
    console.error('Error: --mode parameter is required');
    printUsage();
    process.exit(1);
  }
  
  const mode = args[modeIndex + 1];
  if (!MODE_CONFIGS[mode]) {
    console.error(`Error: Invalid mode "${mode}". Available modes: ${Object.keys(MODE_CONFIGS).join(', ')}`);
    printUsage();
    process.exit(1);
  }
  
  return { mode };
}

// Naming Functions
function getChapterInfo(href, config) {
  if (config.mode === 'reference') {
    const pathParts = href.split('/').filter(p => p);
    
    if (pathParts.length < 2) return null;
    
    const chapterPath = `/${pathParts[0]}/${pathParts[1]}`;
    const chapter = config.chapterMapping[chapterPath];
    
    if (!chapter) {
      return { number: 99, name: 'Other' };
    }
    
    return chapter;
  } else {
    // Learn mode - find the most specific match
    const exactMatch = config.chapterMapping[href];
    if (exactMatch) return exactMatch;
    
    // Check for partial matches
    for (const [path, chapter] of Object.entries(config.chapterMapping)) {
      if (href.startsWith(path)) {
        return chapter;
      }
    }
    
    return { number: 99, name: 'Other' };
  }
}

function getSectionPriority(text, href, config) {
  const lowerText = text.toLowerCase();
  const lowerHref = href ? href.toLowerCase() : '';
  
  for (const [keyword, priority] of Object.entries(config.sectionPriority)) {
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

function organizeLinks(links, config) {
  const chapters = {};
  
  links.forEach(link => {
    const chapterInfo = getChapterInfo(link.href, config);
    if (!chapterInfo) return;
    
    const chapterNum = chapterInfo.number;
    if (!chapters[chapterNum]) {
      chapters[chapterNum] = {
        info: chapterInfo,
        sections: []
      };
    }
    
    chapters[chapterNum].sections.push({
      ...link,
      priority: getSectionPriority(link.text, link.href, config)
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

function generateChapterSectionFilename(link, organizedLinks, config) {
  const chapterInfo = getChapterInfo(link.href, config);
  if (!chapterInfo) {
    return cleanTitle(link.text);
  }
  
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
  
  static progress(current, total, url) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${url}`);
  }
  
  static batch(batch, totalBatches, batchSize) {
    console.log(`[BATCH] Processing batch ${batch}/${totalBatches} (${batchSize} pages)`);
  }
}

class HTMLDownloader {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.pages = [];
    this.organizedLinks = null;
    this.htmlDir = path.join(config.outputDir, 'html');
  }

  async initBrowser() {
    Logger.step('Starting browser with multiple pages');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create pool of pages for concurrent processing
    for (let i = 0; i < CONCURRENT_LIMIT; i++) {
      const page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      this.pages.push(page);
    }
    
    Logger.success(`Browser initialized with ${CONCURRENT_LIMIT} concurrent pages`);
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
      await fs.mkdir(this.htmlDir, { recursive: true });
      Logger.info('Output directories ready');
    } catch (error) {
      Logger.error(`Failed to create directories: ${error.message}`);
      throw error;
    }
  }

  async loadLinksFromLatestFile() {
    try {
      Logger.step('Loading links from JSON file');
      
      const filePath = path.join(this.config.outputDir, this.config.inputFile);
      
      try {
        await fs.access(filePath);
        Logger.info(`Loading links from: ${this.config.inputFile}`);
      } catch {
        throw new Error(`No links JSON file found: ${this.config.inputFile}. Run sidebar scraper first.`);
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const links = JSON.parse(content);
      
      // Organize links for proper naming
      this.organizedLinks = organizeLinks(links, this.config);
      
      Logger.success(`Loaded ${links.length} links for processing`);
      Logger.info(`Organized into ${Object.keys(this.organizedLinks).length} chapters`);
      
      return links;
    } catch (error) {
      Logger.error(`Failed to load links: ${error.message}`);
      throw error;
    }
  }

  async checkExistingFile(filepath, newContent) {
    try {
      const existingContent = await fs.readFile(filepath, 'utf8');
      
      // Enhanced: Compare file hashes for definitive check (no more length comparison)
      const existingHash = crypto.createHash('sha256').update(existingContent).digest('hex');
      const newHash = crypto.createHash('sha256').update(newContent).digest('hex');
      
      return existingHash === newHash;
    } catch (error) {
      // File doesn't exist or can't be read
      return false;
    }
  }

  async downloadSinglePage(page, link, index, total) {
    try {
      Logger.progress(index + 1, total, link.text);
      
      // Generate filename first
      const filename = generateChapterSectionFilename(link, this.organizedLinks, this.config);
      const filepath = path.join(this.htmlDir, `${filename}.html`);
      
      await page.goto(link.fullUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      await page.waitForFunction(() => document.readyState === 'complete');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const htmlContent = await page.content();
      
      if (!htmlContent || htmlContent.length < 1000) {
        throw new Error('Content too short or empty');
      }
      
      // Check if file exists and is identical using enhanced hash comparison
      const isIdentical = await this.checkExistingFile(filepath, htmlContent);
      if (isIdentical) {
        Logger.success(`Skipped: ${filename}.html (identical content)`);
        return {
          filename: `${filename}.html`,
          filepath,
          url: link.fullUrl,
          title: link.text,
          size: htmlContent.length,
          skipped: true
        };
      }
      
      await fs.writeFile(filepath, htmlContent, 'utf8');
      
      Logger.success(`Downloaded: ${filename}.html (${htmlContent.length} chars)`);
      
      return {
        filename: `${filename}.html`,
        filepath,
        url: link.fullUrl,
        title: link.text,
        size: htmlContent.length,
        skipped: false
      };
      
    } catch (error) {
      Logger.error(`Failed to download ${link.fullUrl}: ${error.message}`);
      return null;
    }
  }

  async processBatch(batch, batchNumber, totalBatches) {
    Logger.batch(batchNumber, totalBatches, batch.length);
    
    const downloadPromises = batch.map((link, index) => {
      const pageIndex = index % this.pages.length;
      const page = this.pages[pageIndex];
      const globalIndex = (batchNumber - 1) * CONCURRENT_LIMIT + index;
      
      return this.downloadSinglePage(page, link, globalIndex, batch.totalLinks);
    });
    
    const results = await Promise.allSettled(downloadPromises);
    
    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
    
    const failed = results.filter(r => r.status === 'rejected' || r.value === null).length;
    
    if (failed > 0) {
      Logger.error(`Batch ${batchNumber}: ${failed} pages failed to download`);
    }
    
    Logger.success(`Batch ${batchNumber}: ${successful.length} pages downloaded successfully`);
    return successful;
  }

  async downloadAllPages() {
    try {
      const links = await this.loadLinksFromLatestFile();
      await this.ensureDirectories();
      await this.initBrowser();
      
      // Split into batches for concurrent processing
      const batches = [];
      for (let i = 0; i < links.length; i += CONCURRENT_LIMIT) {
        const batch = links.slice(i, i + CONCURRENT_LIMIT);
        batch.totalLinks = links.length; // Add total for progress calculation
        batches.push(batch);
      }
      
      Logger.info(`Starting download of ${links.length} pages in ${batches.length} batches`);
      
      const allResults = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batchResults = await this.processBatch(batches[i], i + 1, batches.length);
        allResults.push(...batchResults);
        
        // Delay between batches to be respectful
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      const successCount = allResults.length;
      const skippedCount = allResults.filter(result => result.skipped).length;
      const downloadedCount = allResults.filter(result => !result.skipped).length;
      const totalSize = allResults.reduce((sum, result) => sum + result.size, 0);
      
      Logger.success(`Download completed: ${successCount}/${links.length} pages (${downloadedCount} downloaded, ${skippedCount} skipped)`);
      Logger.info(`Total HTML size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      
    } catch (error) {
      Logger.error(`Bulk download failed: ${error.message}`);
      throw error;
    } finally {
      if (this.browser) {
        Logger.step('Closing browser');
        await this.browser.close();
        Logger.success('Browser closed');
      }
    }
  }
}

async function main() {
  const { mode } = parseArgs();
  const config = { ...MODE_CONFIGS[mode], mode };
  
  Logger.info(`Starting React ${mode.charAt(0).toUpperCase() + mode.slice(1)} HTML Downloader`);
  
  try {
    const downloader = new HTMLDownloader(config);
    await downloader.downloadAllPages();
    Logger.success('HTML download phase completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
