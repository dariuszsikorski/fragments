#!/usr/bin/env node

/**
 * Unified Phase 1: Extract Sidebar Links
 * Scrapes React.dev sidebar navigation for both reference and learn sections
 * Usage: node 01-extract-links-unified.js --mode reference|learn
 * Output: react-{mode}-links.json
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

// Mode Configuration
const MODE_CONFIGS = {
  reference: {
    targetUrl: 'https://react.dev/reference',
    outputDir: './scripts/react-reference',
    outputFile: 'react-reference-links.json',
    description: 'React Reference Documentation'
  },
  learn: {
    targetUrl: 'https://react.dev/learn',
    outputDir: './scripts/react-learn', 
    outputFile: 'react-learn-links.json',
    description: 'React Learn Documentation'
  }
};

function printUsage() {
  console.log(`
Usage: node 01-extract-links-unified.js --mode <mode>

Extract sidebar navigation links from React documentation.

Options:
  --mode <mode>     Extraction mode (required)
                    Available modes: reference, learn
  --help, -h        Show this help message

Examples:
  node 01-extract-links-unified.js --mode reference
  node 01-extract-links-unified.js --mode learn

Output:
  reference mode: Creates react-reference-links.json in ./react-reference/
  learn mode:     Creates react-learn-links.json in ./react-learn/

Features:
  - Extracts all sidebar navigation links
  - Handles JavaScript-rendered content
  - Saves structured JSON output with full URLs
`);
}

function parseArguments() {
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
  
  return mode;
}

class Logger {
  constructor(mode) {
    this.mode = mode.toUpperCase();
  }
  
  info(msg) {
    console.log(`[INFO] [${this.mode}] ${new Date().toISOString()} - ${msg}`);
  }
  
  success(msg) {
    console.log(`[SUCCESS] [${this.mode}] ${new Date().toISOString()} - ${msg}`);
  }
  
  error(msg) {
    console.log(`[ERROR] [${this.mode}] ${new Date().toISOString()} - ${msg}`);
  }
  
  step(msg) {
    console.log(`[STEP] [${this.mode}] ${new Date().toISOString()} - ${msg}`);
  }
}

function parseSidebarLinks(sidebarHtml, logger) {
  logger.step('Parsing sidebar HTML with Cheerio');
  
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
  
  logger.success(`Extracted ${links.length} links from sidebar`);
  return links;
}

async function ensureOutputDir(outputDir, logger) {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    logger.info('Output directory ready');
  } catch (error) {
    logger.error(`Failed to create output directory: ${error.message}`);
    throw error;
  }
}

async function scrapeReactDocumentation(mode) {
  const config = MODE_CONFIGS[mode];
  const logger = new Logger(mode);
  let browser = null;
  
  try {
    logger.step('Starting browser launch');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    logger.success('Browser launched successfully');
    
    const page = await browser.newPage();
    logger.step('New page created');
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1920, height: 1080 });
    logger.step('Viewport set to 1920x1080');
    
    logger.step(`Navigating to ${config.targetUrl}`);
    await page.goto(config.targetUrl, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    logger.success('Page loaded successfully');
    
    // Wait for JS to fully render
    logger.step('Waiting for JavaScript rendering');
    await page.waitForFunction(() => document.readyState === 'complete');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract sidebar navigation specifically
    logger.step('Extracting sidebar navigation');
    const sidebarContent = await page.evaluate(() => {
      // Look for navigation elements
      const nav = document.querySelector('nav[role="navigation"]');
      return nav ? nav.outerHTML : null;
    });
    
    if (!sidebarContent) {
      logger.error('Sidebar navigation not found');
      return;
    }
    
    logger.success('Sidebar navigation extracted');
    
    // Parse sidebar links using Cheerio
    const parsedLinks = parseSidebarLinks(sidebarContent, logger);
    
    await ensureOutputDir(config.outputDir, logger);
    
    // Save the essential links JSON file
    const linksFile = path.join(config.outputDir, config.outputFile);
    
    logger.step('Writing parsed links to JSON file');
    await fs.writeFile(linksFile, JSON.stringify(parsedLinks, null, 2), 'utf8');
    
    logger.success(`Links saved: ${config.outputFile}`);
    logger.info(`Parsed links count: ${parsedLinks.length} items`);
    
    // Output parsed links as JS object
    console.log(`\n=== PARSED SIDEBAR LINKS (${mode.toUpperCase()}) ===`);
    console.log(JSON.stringify(parsedLinks, null, 2));
    
  } catch (error) {
    logger.error(`Scraping failed: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      logger.step('Closing browser');
      await browser.close();
      logger.success('Browser closed');
    }
  }
}

async function main() {
  const mode = parseArguments();
  const config = MODE_CONFIGS[mode];
  const logger = new Logger(mode);
  
  logger.info(`Starting React ${config.description} scraper`);
  
  try {
    await scrapeReactDocumentation(mode);
    logger.success('Scraping completed successfully');
  } catch (error) {
    logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
