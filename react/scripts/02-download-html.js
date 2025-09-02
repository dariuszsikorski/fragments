#!/usr/bin/env node

/**
 * Phase 2: Download HTML Pages
 * Downloads original HTML content from all reference pages (10 concurrent)
 * Input: react-reference-links-*.json | Output: /html/{filename}.html files
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = './react-reference';
const HTML_DIR = './react-reference/html';
const CONCURRENT_LIMIT = 10;
const DELAY_BETWEEN_BATCHES = 2000;

// Naming Functions
const CHAPTER_MAPPING = {
  '/reference/react': { number: 1, name: 'React Core' },
  '/reference/react-dom': { number: 2, name: 'React DOM' },
  '/reference/react-compiler': { number: 3, name: 'React Compiler' },
  '/reference/rsc': { number: 4, name: 'React Server Components' },
  '/reference/rules': { number: 5, name: 'Rules of React' }
};

const SECTION_PRIORITY = {
  'overview': 1,
  'hooks': 2,
  'components': 3,
  'apis': 4,
  'client': 5,
  'server': 6
};

function getChapterInfo(href) {
  const pathParts = href.split('/').filter(p => p);
  
  if (pathParts.length < 2) return null;
  
  const chapterPath = `/${pathParts[0]}/${pathParts[1]}`;
  const chapter = CHAPTER_MAPPING[chapterPath];
  
  if (!chapter) {
    return { number: 99, name: 'Other' };
  }
  
  return chapter;
}

function getSectionPriority(text) {
  const lowerText = text.toLowerCase();
  
  for (const [keyword, priority] of Object.entries(SECTION_PRIORITY)) {
    if (lowerText.includes(keyword)) {
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
      priority: getSectionPriority(link.text)
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
      Logger.step('Loading links from latest JSON file');
      
      const files = await fs.readdir(OUTPUT_DIR);
      const linkFiles = files.filter(f => f.startsWith('react-reference-links-') && f.endsWith('.json'));
      
      if (linkFiles.length === 0) {
        throw new Error('No links JSON file found. Run sidebar scraper first.');
      }
      
      linkFiles.sort().reverse();
      const latestFile = linkFiles[0];
      const filePath = path.join(OUTPUT_DIR, latestFile);
      
      Logger.info(`Loading links from: ${latestFile}`);
      
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

  async downloadSinglePage(page, link, index, total) {
    try {
      Logger.progress(index + 1, total, link.text);
      
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
      
      // Generate filename using new chapter-section naming
      const filename = generateChapterSectionFilename(link, this.organizedLinks);
      const filepath = path.join(HTML_DIR, `${filename}.html`);
      
      await fs.writeFile(filepath, htmlContent, 'utf8');
      
      Logger.success(`Downloaded: ${filename}.html (${htmlContent.length} chars)`);
      
      return {
        filename: `${filename}.html`,
        filepath,
        url: link.fullUrl,
        title: link.text,
        size: htmlContent.length
      };
      
    } catch (error) {
      Logger.error(`Failed to download ${link.fullUrl}: ${error.message}`);
      return null;
    }
  }
  // Legacy filename generation - kept for compatibility
  generateFilename(href, text) {
    let filename = href.replace(/^\//, '').replace(/\//g, '_');
    
    if (!filename || filename === 'reference') {
      filename = text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }
    
    return filename;
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
      const totalSize = allResults.reduce((sum, result) => sum + result.size, 0);
      
      Logger.success(`Download completed: ${successCount}/${links.length} pages`);
      Logger.info(`Total HTML size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Save download summary
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const summaryPath = path.join(OUTPUT_DIR, `download-summary-${timestamp}.json`);
      await fs.writeFile(summaryPath, JSON.stringify(allResults, null, 2), 'utf8');
      
      Logger.success(`Download summary saved: download-summary-${timestamp}.json`);
      
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
  Logger.info('Starting React Reference HTML Downloader');
  
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
