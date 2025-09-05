#!/usr/bin/env node

/**
 * Phase 1: Extract Sidebar Links (Learn Section)
 * Scrapes https://react.dev/learn sidebar navigation and extracts documentation links
 * Output: react-learn-links.json
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const TARGET_URL = 'https://react.dev/learn';
const OUTPUT_DIR = './react-learn';

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
}

function parseSidebarLinks(sidebarHtml) {
  Logger.step('Parsing sidebar HTML with Cheerio');
  
  const $ = cheerio.load(sidebarHtml);
  const links = [];
  
  // Extract all anchor tags with href attributes
  $('a[href]').each((index, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    const title = $link.attr('title') || '';
    const textContent = $link.text().trim();
    
    // Skip empty or invalid links
    if (href && textContent) {
      links.push({
        href: href,
        title: title,
        text: textContent,
        fullUrl: href.startsWith('/') ? `https://react.dev${href}` : href
      });
    }
  });
  
  Logger.success(`Extracted ${links.length} links from sidebar`);
  return links;
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

async function scrapeReactLearn() {
  let browser = null;
  
  try {
    Logger.step('Starting browser launch');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    Logger.success('Browser launched successfully');
    
    const page = await browser.newPage();
    Logger.step('New page created');
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1920, height: 1080 });
    Logger.step('Viewport set to 1920x1080');
    
    Logger.step(`Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    Logger.success('Page loaded successfully');
    
    // Wait for JS to fully render
    Logger.step('Waiting for JavaScript rendering');
    await page.waitForFunction(() => document.readyState === 'complete');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract sidebar navigation specifically
    Logger.step('Extracting sidebar navigation');
    const sidebarContent = await page.evaluate(() => {
      // Look for navigation elements
      const nav = document.querySelector('nav[role="navigation"]');
      return nav ? nav.outerHTML : null;
    });
    
    if (!sidebarContent) {
      Logger.error('Sidebar navigation not found');
      return;
    }
    
    Logger.success('Sidebar navigation extracted');
    
    // Parse sidebar links using Cheerio
    const parsedLinks = parseSidebarLinks(sidebarContent);
    
    await ensureOutputDir();
    
    // Only save the essential links JSON file
    const linksFile = path.join(OUTPUT_DIR, 'react-learn-links.json');
    
    Logger.step('Writing parsed links to JSON file');
    await fs.writeFile(linksFile, JSON.stringify(parsedLinks, null, 2), 'utf8');
    
    Logger.success(`Links saved: react-learn-links.json`);
    Logger.info(`Parsed links count: ${parsedLinks.length} items`);
    
    // Output parsed links as JS object
    console.log('\n=== PARSED SIDEBAR LINKS ===');
    console.log(JSON.stringify(parsedLinks, null, 2));
    
  } catch (error) {
    Logger.error(`Scraping failed: ${error.message}`);
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
  Logger.info('Starting React Learn scraper');
  
  try {
    await scrapeReactLearn();
    Logger.success('Scraping completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
