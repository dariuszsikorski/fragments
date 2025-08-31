#!/usr/bin/env node

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'https://react.dev';
const OUTPUT_DIR = './scripts/output';
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between requests

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
}

async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    Logger.info('Output directory ready');
  } catch (error) {
    Logger.error(`Failed to create output directory: ${error.message}`);
    throw error;
  }
}

async function loadLinksFromLatestFile() {
  try {
    Logger.step('Loading links from latest JSON file');
    
    const files = await fs.readdir(OUTPUT_DIR);
    const linkFiles = files.filter(f => f.startsWith('react-reference-links-') && f.endsWith('.json'));
    
    if (linkFiles.length === 0) {
      throw new Error('No links JSON file found. Run the sidebar scraper first.');
    }
    
    // Get the latest file
    linkFiles.sort().reverse();
    const latestFile = linkFiles[0];
    const filePath = path.join(OUTPUT_DIR, latestFile);
    
    Logger.info(`Loading links from: ${latestFile}`);
    
    const content = await fs.readFile(filePath, 'utf8');
    const links = JSON.parse(content);
    
    Logger.success(`Loaded ${links.length} links`);
    return links;
  } catch (error) {
    Logger.error(`Failed to load links: ${error.message}`);
    throw error;
  }
}
async function scrapePageContent(page, url) {
  try {
    Logger.step(`Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for content to be fully rendered
    await page.waitForFunction(() => document.readyState === 'complete');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract main content
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main[role="main"]');
      return main ? main.textContent : null;
    });
    
    if (!mainContent) {
      Logger.error(`No main content found for ${url}`);
      return null;
    }
    
    const cleanContent = mainContent.trim().replace(/\s+/g, ' ');
    const wordCount = cleanContent.split(' ').filter(word => word.length > 0).length;
    
    return {
      text: cleanContent,
      wordCount: wordCount,
      lastModified: new Date().toISOString(),
      url: url
    };
    
  } catch (error) {
    Logger.error(`Failed to scrape ${url}: ${error.message}`);
    return null;
  }
}

async function bulkScrapeReactReference() {
  let browser = null;
  const scrapedData = {};
  
  try {
    // Load links from previous run
    const links = await loadLinksFromLatestFile();
    
    Logger.step('Starting browser launch');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    Logger.success('Browser launched successfully');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    Logger.info(`Starting bulk scrape of ${links.length} URLs`);
    
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const url = link.fullUrl;
      
      Logger.progress(i + 1, links.length, url);
      
      const content = await scrapePageContent(page, url);
      
      if (content) {
        scrapedData[url] = {
          text: content.text,
          wordCount: content.wordCount,
          lastModified: content.lastModified
        };
        Logger.success(`Scraped: ${content.wordCount} words`);
      }
      
      // Add delay between requests to be respectful
      if (i < links.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }
    
    // Save bulk scraped data
    await ensureOutputDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `react-bulk-content-${timestamp}.json`);
    
    Logger.step('Writing bulk scraped data to file');
    await fs.writeFile(outputFile, JSON.stringify(scrapedData, null, 2), 'utf8');
    
    Logger.success(`Bulk scraped data saved: ${outputFile}`);
    
    // Output statistics
    const totalWords = Object.values(scrapedData).reduce((sum, item) => sum + item.wordCount, 0);
    const successCount = Object.keys(scrapedData).length;
    
    Logger.info(`Successfully scraped: ${successCount}/${links.length} pages`);
    Logger.info(`Total word count: ${totalWords.toLocaleString()} words`);
    
    // Output parsed data as JS object
    console.log('\n=== BULK SCRAPED CONTENT ===');
    console.log(JSON.stringify(scrapedData, null, 2));
    
  } catch (error) {
    Logger.error(`Bulk scraping failed: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      Logger.step('Closing browser');
      await browser.close();
      Logger.success('Browser closed');
    }
  }
}

async function main() {
  Logger.info('Starting React reference bulk scraper');
  
  try {
    await bulkScrapeReactReference();
    Logger.success('Bulk scraping completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();

async function scrapePageContent(page, url) {
  try {
    Logger.step(`Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Wait for content to be fully rendered
    await page.waitForFunction(() => document.readyState === 'complete');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract main content
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main[role="main"]');
      return main ? main.textContent : null;
    });
    
    if (!mainContent) {
      Logger.error(`No main content found for ${url}`);
      return null;
    }
    
    const cleanContent = mainContent.trim().replace(/\s+/g, ' ');
    const wordCount = cleanContent.split(' ').filter(word => word.length > 0).length;
    
    return {
      text: cleanContent,
      wordCount: wordCount,
      lastModified: new Date().toISOString(),
      url: url
    };
    
  } catch (error) {
    Logger.error(`Failed to scrape ${url}: ${error.message}`);
    return null;
  }
}

async function bulkScrapeReactReference() {
  let browser = null;
  const scrapedData = {};
  
  try {
    // Load links from previous run
    const links = await loadLinksFromLatestFile();
    
    Logger.step('Starting browser launch');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    Logger.success('Browser launched successfully');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    Logger.info(`Starting bulk scrape of ${links.length} URLs`);
    
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const url = link.fullUrl;
      
      Logger.progress(i + 1, links.length, url);
      
      const content = await scrapePageContent(page, url);
      
      if (content) {
        scrapedData[url] = {
          text: content.text,
          wordCount: content.wordCount,
          lastModified: content.lastModified
        };
        Logger.success(`Scraped: ${content.wordCount} words`);
      }
      
      // Add delay between requests to be respectful
      if (i < links.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }
    
    // Save bulk scraped data
    await ensureOutputDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `react-bulk-content-${timestamp}.json`);
    
    Logger.step('Writing bulk scraped data to file');
    await fs.writeFile(outputFile, JSON.stringify(scrapedData, null, 2), 'utf8');
    
    Logger.success(`Bulk scraped data saved: ${outputFile}`);
    
    // Output statistics
    const totalWords = Object.values(scrapedData).reduce((sum, item) => sum + item.wordCount, 0);
    const successCount = Object.keys(scrapedData).length;
    
    Logger.info(`Successfully scraped: ${successCount}/${links.length} pages`);
    Logger.info(`Total word count: ${totalWords.toLocaleString()} words`);
    
    // Output parsed data as JS object
    console.log('\n=== BULK SCRAPED CONTENT ===');
    console.log(JSON.stringify(scrapedData, null, 2));
    
  } catch (error) {
    Logger.error(`Bulk scraping failed: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      Logger.step('Closing browser');
      await browser.close();
      Logger.success('Browser closed');
    }
  }
}

async function main() {
  Logger.info('Starting React reference bulk scraper');
  
  try {
    await bulkScrapeReactReference();
    Logger.success('Bulk scraping completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
