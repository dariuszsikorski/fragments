#!/usr/bin/env node

/**
 * Phase 3: Convert to Markdown (Unified)
 * Converts HTML files to markdown using Mozilla Reader Mode + Turndown (20 concurrent)
 * Input: /{mode}/html/*.html files | Output: /{mode}/markdown/*.md files + INDEX.md
 * 
 * Usage: node 03-convert-markdown-unified.js --mode <reference|learn>
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';

const CONCURRENT_LIMIT = 20;

// Mode-specific configurations
const MODE_CONFIGS = {
  reference: {
    outputDir: './scripts/react-reference',
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
    outputDir: './scripts/react-learn',
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
Usage: node 03-convert-markdown-unified.js --mode <mode>

Convert HTML files to markdown using Mozilla Readability and Turndown.

Options:
  --mode <mode>     Conversion mode (required)
                    Available modes: reference, learn
  --help, -h        Show this help message

Examples:
  node 03-convert-markdown-unified.js --mode reference
  node 03-convert-markdown-unified.js --mode learn

Output:
  reference mode: Converts to ./react-reference/markdown/
  learn mode:     Converts to ./react-learn/markdown/

Features:
  - Smart skipping (only reconvert if HTML is newer)
  - Dual index generation (INDEX.md + 00-0-index-of-contents.md)
  - Pure header extraction with content filtering
  - Mozilla Readability for clean content extraction
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
  
  static progress(current, total, title) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${title}`);
  }
  
  static batch(batch, totalBatches, batchSize) {
    console.log(`[BATCH] Converting batch ${batch}/${totalBatches} (${batchSize} files)`);
  }
}

class MarkdownConverter {
  constructor(config) {
    this.config = config;
    this.htmlDir = path.join(config.outputDir, 'html');
    this.markdownDir = path.join(config.outputDir, 'markdown');
    this.organizedLinks = null;
    
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined'
    });
    
    // Configure turndown to handle code blocks better
    this.turndownService.addRule('codeblock', {
      filter: ['pre'],
      replacement: function(content, node) {
        const lang = node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || '';
        return `\n\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n\n`;
      }
    });
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
      await fs.mkdir(this.markdownDir, { recursive: true });
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
        throw new Error(`No links JSON file found: ${this.config.inputFile}`);
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const links = JSON.parse(content);
      
      // Organize links for proper naming
      this.organizedLinks = organizeLinks(links, this.config);
      
      Logger.success(`Loaded ${links.length} links for conversion`);
      Logger.info(`Organized into ${Object.keys(this.organizedLinks).length} chapters`);
      return links;
    } catch (error) {
      Logger.error(`Failed to load links: ${error.message}`);
      throw error;
    }
  }

  async getHTMLFiles() {
    try {
      Logger.step('Scanning for downloaded HTML files');
      
      const files = await fs.readdir(this.htmlDir);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      
      if (htmlFiles.length === 0) {
        throw new Error('No HTML files found. Run download phase first.');
      }
      
      Logger.success(`Found ${htmlFiles.length} HTML files to convert`);
      return htmlFiles;
    } catch (error) {
      Logger.error(`Failed to scan HTML files: ${error.message}`);
      throw error;
    }
  }

  async shouldSkipConversion(htmlPath, markdownPath) {
    try {
      // Check if markdown file exists
      const markdownStats = await fs.stat(markdownPath);
      const htmlStats = await fs.stat(htmlPath);
      
      // If HTML is newer than markdown, reconvert
      if (htmlStats.mtime > markdownStats.mtime) {
        return false;
      }
      
      // If markdown exists and HTML hasn't changed, skip
      return true;
    } catch (error) {
      // If markdown doesn't exist or any error, don't skip
      return false;
    }
  }

  async convertSingleFile(htmlFilename, links, index, total) {
    try {
      const htmlPath = path.join(this.htmlDir, htmlFilename);
      
      // Find corresponding link data by matching the chapter-section filename
      const baseFilename = htmlFilename.replace('.html', '');
      const link = links.find(l => generateChapterSectionFilename(l, this.organizedLinks, this.config) === baseFilename);
      
      if (!link) {
        Logger.error(`No link data found for: ${htmlFilename}`);
        return null;
      }
      
      Logger.progress(index + 1, total, link.text);
      
      // Check if we should skip conversion
      const markdownPath = path.join(this.markdownDir, `${baseFilename}.md`);
      const shouldSkip = await this.shouldSkipConversion(htmlPath, markdownPath);
      
      if (shouldSkip) {
        Logger.success(`Skipped: ${baseFilename}.md (already up-to-date)`);
        
        // Return basic info for existing file
        try {
          const existingContent = await fs.readFile(markdownPath, 'utf8');
          const wordCount = existingContent.split(/\s+/).length;
          return {
            filename: `${baseFilename}.md`,
            title: link.text,
            excerpt: '',
            wordCount: wordCount,
            url: link.fullUrl,
            path: link.href,
            skipped: true
          };
        } catch (error) {
          // If we can't read existing file, proceed with conversion
        }
      }
      
      const htmlContent = await fs.readFile(htmlPath, 'utf8');
      
      // Apply Mozilla Readability (Reader Mode)
      const dom = new JSDOM(htmlContent, { url: link.fullUrl });
      const reader = new Readability(dom.window.document.cloneNode(true), {
        debug: false,
        charThreshold: 500
      });
      
      const article = reader.parse();
      
      if (!article || !article.content) {
        Logger.error(`No readable content extracted from: ${link.text}`);
        return null;
      }
      
      // Convert cleaned HTML to Markdown
      const markdown = this.turndownService.turndown(article.content);
      
      // Create markdown document with metadata
      const markdownWithMeta = this.createMarkdownDocument(article, link, markdown);
      
      // Save markdown file with proper chapter-section naming
      await fs.writeFile(markdownPath, markdownWithMeta, 'utf8');
      
      Logger.success(`Converted: ${baseFilename}.md (${markdownWithMeta.length} chars)`);
      
      return {
        filename: `${baseFilename}.md`,
        title: article.title || link.text,
        excerpt: article.excerpt || '',
        wordCount: markdown.split(/\s+/).length,
        url: link.fullUrl,
        path: link.href,
        skipped: false
      };
      
    } catch (error) {
      Logger.error(`Failed to convert ${htmlFilename}: ${error.message}`);
      return null;
    }
  }

  createMarkdownDocument(article, link, markdown) {
    const timestamp = new Date().toISOString();
    
    return `---
title: "${article.title || link.text}"
url: ${link.fullUrl}
path: ${link.href}
excerpt: "${(article.excerpt || '').replace(/"/g, '\\"')}"
length: ${article.length || 0}
scraped: ${timestamp}
---

# ${article.title || link.text}

> **Source:** [${link.fullUrl}](${link.fullUrl})
> 
> **Path:** \`${link.href}\`

${markdown}

---
*Converted from HTML using Mozilla Readability and Turndown on ${timestamp}*
`;
  }

  async processBatch(batch, batchNumber, totalBatches, links) {
    Logger.batch(batchNumber, totalBatches, batch.length);
    
    const conversionPromises = batch.map((htmlFile, index) => {
      const globalIndex = (batchNumber - 1) * CONCURRENT_LIMIT + index;
      return this.convertSingleFile(htmlFile, links, globalIndex, batch.totalFiles);
    });
    
    const results = await Promise.allSettled(conversionPromises);
    
    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
    
    const failed = results.filter(r => r.status === 'rejected' || r.value === null).length;
    
    if (failed > 0) {
      Logger.error(`Batch ${batchNumber}: ${failed} files failed to convert`);
    }
    
    Logger.success(`Batch ${batchNumber}: ${successful.length} files converted successfully`);
    return successful;
  }

  async generateIndexFile(processedPages) {
    const validPages = processedPages.filter(p => p !== null);
    const modeTitle = this.config.mode.charAt(0).toUpperCase() + this.config.mode.slice(1);
    
    let indexContent = `# React ${modeTitle} Documentation - Markdown Collection

**Generated:** ${new Date().toISOString()}  
**Total Pages:** ${validPages.length}  
**Source:** [React.dev ${modeTitle}](https://react.dev/${this.config.mode})

## Table of Contents

`;

    const categories = {};
    validPages.forEach(page => {
      const pathParts = page.path.split('/').filter(p => p);
      const category = pathParts.length > 2 ? pathParts[2] : 'Other';
      
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(page);
    });

    Object.keys(categories).sort().forEach(category => {
      indexContent += `\n### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      
      categories[category].forEach(page => {
        const excerpt = page.excerpt ? ` - ${page.excerpt.substring(0, 100)}...` : '';
        indexContent += `- [${page.title}](${page.filename})${excerpt}\n`;
      });
    });

    indexContent += `\n---\n*Generated with Mozilla Readability and Turndown*\n`;

    const indexPath = path.join(this.markdownDir, 'INDEX.md');
    await fs.writeFile(indexPath, indexContent, 'utf8');
    Logger.success(`Index file created: INDEX.md`);
  }

  async extractHeadersFromMarkdown(content) {
    const lines = content.split('\n');
    const headers = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2].trim();
          headers.push({ level, text });
        }
      }
    }
    
    return headers;
  }

  // Words to filter out (not actual content headers)
  static FILTER_OUT_WORDS = [
    'note', 'pitfall', 'deep dive', 'experimental feature', 'deprecated',
    'under construction', 'warning', 'caution', 'tip', 'info'
  ];

  isValidHeader(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Filter out common non-content words
    if (MarkdownConverter.FILTER_OUT_WORDS.some(word => lowerText === word)) {
      return false;
    }
    
    // Filter out very short headers (likely navigation elements)
    if (lowerText.length < 3) {
      return false;
    }
    
    // Keep headers that look like actual content
    return true;
  }

  async extractPureHeadersFromMarkdown(content) {
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
  }

  async generateIndexOfContents(processedPages) {
    Logger.step('Generating pure headers index of contents');
    
    const validPages = processedPages.filter(p => p !== null);
    
    // Sort pages by filename to maintain order
    validPages.sort((a, b) => a.filename.localeCompare(b.filename));
    
    const timestamp = new Date().toISOString();
    const modeTitle = this.config.mode.charAt(0).toUpperCase() + this.config.mode.slice(1);
    
    let tocContent = `---
title: "React ${modeTitle} Documentation - Index of Contents (Pure Headers)"
generated: ${timestamp}
total_pages: ${validPages.length}
---

# Index of Contents - React ${modeTitle} Documentation (Pure Headers)

> **Complete table of contents with ONLY pure content headers from ${validPages.length} documentation pages**
> 
> **Generated:** ${timestamp}  
> **Source:** [React.dev ${modeTitle}](https://react.dev/${this.config.mode})
> **Filtered:** Excludes meta-content like "Note", "Pitfall", "Deep Dive", etc.

---

`;

    let totalHeaders = 0;

    // Process each page to extract headers
    for (const page of validPages) {
      try {
        const markdownPath = path.join(this.markdownDir, page.filename);
        const markdownContent = await fs.readFile(markdownPath, 'utf8');
        const headers = await this.extractPureHeadersFromMarkdown(markdownContent);
        
        if (headers.length > 0) {
          tocContent += `## ${page.title}\n\n`;
          tocContent += `> **File:** [\`${page.filename}\`](${page.filename})  \n`;
          tocContent += `> **URL:** [${page.url}](${page.url})  \n`;
          tocContent += `> **Path:** \`${page.path}\`\n`;
          tocContent += `> **Headers:** ${headers.length}\n\n`;
          
          headers.forEach(header => {
            const indent = '  '.repeat(header.level - 1);
            tocContent += `${indent}- ${header.text}\n`;
          });
          
          tocContent += '\n';
          totalHeaders += headers.length;
        }
      } catch (error) {
        Logger.error(`Failed to process headers for ${page.filename}: ${error.message}`);
      }
    }

    tocContent += `---\n\n## Statistics\n\n`;
    tocContent += `- **Total Pages:** ${validPages.length}\n`;
    tocContent += `- **Total Headers:** ${totalHeaders}\n`;
    tocContent += `- **Total Word Count:** ${validPages.reduce((sum, page) => sum + page.wordCount, 0).toLocaleString()}\n`;
    tocContent += `- **Generated:** ${timestamp}\n`;
    tocContent += `- **Source:** React.dev ${modeTitle} Documentation\n`;
    tocContent += `- **Format:** Pure Headers Only (# ## ### ####)\n`;
    tocContent += `- **Filtered Out:** Meta-content, navigation elements, notes\n\n`;
    tocContent += `*This index contains only content headers for clean documentation navigation.*\n`;

    const tocPath = path.join(this.markdownDir, '00-0-index-of-contents.md');
    await fs.writeFile(tocPath, tocContent, 'utf8');
    Logger.success(`Pure headers index of contents created: 00-0-index-of-contents.md`);
    Logger.info(`Total headers extracted: ${totalHeaders}`);
  }

  async convertAllPages() {
    try {
      const links = await this.loadLinksFromLatestFile();
      const htmlFiles = await this.getHTMLFiles();
      await this.ensureDirectories();
      
      // Split into batches for concurrent processing  
      const batches = [];
      for (let i = 0; i < htmlFiles.length; i += CONCURRENT_LIMIT) {
        const batch = htmlFiles.slice(i, i + CONCURRENT_LIMIT);
        batch.totalFiles = htmlFiles.length;
        batches.push(batch);
      }
      
      Logger.info(`Starting conversion of ${htmlFiles.length} HTML files in ${batches.length} batches`);
      
      const allResults = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batchResults = await this.processBatch(batches[i], i + 1, batches.length, links);
        allResults.push(...batchResults);
      }
      
      await this.generateIndexFile(allResults);
      await this.generateIndexOfContents(allResults);
      
      const successCount = allResults.length;
      const skippedCount = allResults.filter(result => result && result.skipped).length;
      const convertedCount = allResults.filter(result => result && !result.skipped).length;
      const totalWords = allResults.reduce((sum, page) => sum + (page ? page.wordCount : 0), 0);
      
      Logger.success(`Conversion completed: ${successCount}/${htmlFiles.length} files (${convertedCount} converted, ${skippedCount} skipped)`);
      Logger.info(`Total word count: ${totalWords.toLocaleString()} words`);
      Logger.info(`Markdown files saved in: ${this.markdownDir}`);
      Logger.info(`Index of contents: ${this.markdownDir}/00-0-index-of-contents.md`);
      
    } catch (error) {
      Logger.error(`Conversion failed: ${error.message}`);
      throw error;
    }
  }
}

async function main() {
  const { mode } = parseArgs();
  const config = { ...MODE_CONFIGS[mode], mode };
  
  Logger.info(`Starting React ${mode.charAt(0).toUpperCase() + mode.slice(1)} HTML-to-Markdown Converter`);
  
  try {
    const converter = new MarkdownConverter(config);
    await converter.convertAllPages();
    Logger.success('HTML-to-Markdown conversion completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
