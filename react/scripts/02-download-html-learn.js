#!/usr/bin/env node

/**
 * Phase 2: Download HTML Pages (Learn Section)
 * Downloads original HTML content from all Learn pages (20 concurrent)
 * Input: react-learn-links.json | Output: /html/{filename}.html files
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const OUTPUT_DIR = './react-learn';
const HTML_DIR = './react-learn/html';
const CONCURRENT_LIMIT = 20;
const DELAY_BETWEEN_BATCHES = 2000;

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
  
  static progress(current, total, url) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${url}`);
  }
  
  static batch(batch, totalBatches, batchSize) {
    console.log(`[BATCH] Processing batch ${batch}/${totalBatches} (${batchSize} pages)`);
  }
}

class HTMLDownloader {
  constructor() {
    this.browser = null;
    this.pages = [];
    this.organizedLinks = null;
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
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.mkdir(HTML_DIR, { recursive: true });
      Logger.info('Output directories ready');
    } catch (error) {
      Logger.error(`Failed to create directories: ${error.message}`);
      throw error;
    }
  }

  async loadLinksFromLatestFile() {
    try {
      Logger.step('Loading links from JSON file');
      
      const filePath = path.join(OUTPUT_DIR, 'react-learn-links.json');
      
      try {
        await fs.access(filePath);
        Logger.info(`Loading links from: react-learn-links.json`);
      } catch {
        throw new Error('No links JSON file found. Run sidebar scraper first.');
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const links = JSON.parse(content);
      
      // Organize links for proper naming
      this.organizedLinks = organizeLinks(links);
      
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
      
      // Compare content length first (fast check)
      if (existingContent.length !== newContent.length) {
        return false;
      }
      
      // Compare file hashes for definitive check
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
      const filename = generateChapterSectionFilename(link, this.organizedLinks);
      const filepath = path.join(HTML_DIR, `${filename}.html`);
      
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
      
      // Check if file exists and is identical
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
  Logger.info('Starting React Learn HTML Downloader');
  
  try {
    const downloader = new HTMLDownloader();
    await downloader.downloadAllPages();
    Logger.success('HTML download phase completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
