#!/usr/bin/env node

/**
 * Phase 3: Convert to Markdown  
 * Converts HTML files to markdown using Mozilla Reader Mode + Turndown (20 concurrent)
 * Input: /html/*.html files | Output: /markdown/*.md files + INDEX.md
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = './react-reference';
const HTML_DIR = './react-reference/html';
const MARKDOWN_DIR = './react-reference/markdown';
const CONCURRENT_LIMIT = 20;

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
  
  static progress(current, total, title) {
    const percentage = Math.round((current / total) * 100);
    console.log(`[PROGRESS] ${current}/${total} (${percentage}%) - ${title}`);
  }
  
  static batch(batch, totalBatches, batchSize) {
    console.log(`[BATCH] Converting batch ${batch}/${totalBatches} (${batchSize} files)`);
  }
}

class MarkdownConverter {
  constructor() {
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
    
    this.organizedLinks = null;
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

  async loadLinksFromLatestFile() {
    try {
      Logger.step('Loading links from latest JSON file');
      
      const files = await fs.readdir(OUTPUT_DIR);
      const linkFiles = files.filter(f => f.startsWith('react-reference-links-') && f.endsWith('.json'));
      
      if (linkFiles.length === 0) {
        throw new Error('No links JSON file found');
      }
      
      linkFiles.sort().reverse();
      const latestFile = linkFiles[0];
      const filePath = path.join(OUTPUT_DIR, latestFile);
      
      Logger.info(`Loading links from: ${latestFile}`);
      
      const content = await fs.readFile(filePath, 'utf8');
      const links = JSON.parse(content);
      
      // Organize links for proper naming
      this.organizedLinks = organizeLinks(links);
      
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
      
      const files = await fs.readdir(HTML_DIR);
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
  async convertSingleFile(htmlFilename, links, index, total) {
    try {
      const htmlPath = path.join(HTML_DIR, htmlFilename);
      const htmlContent = await fs.readFile(htmlPath, 'utf8');
      
      // Find corresponding link data by matching the chapter-section filename
      const baseFilename = htmlFilename.replace('.html', '');
      const link = links.find(l => generateChapterSectionFilename(l, this.organizedLinks) === baseFilename);
      
      if (!link) {
        Logger.error(`No link data found for: ${htmlFilename}`);
        return null;
      }
      
      Logger.progress(index + 1, total, link.text);
      
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
      const markdownPath = path.join(MARKDOWN_DIR, `${baseFilename}.md`);
      await fs.writeFile(markdownPath, markdownWithMeta, 'utf8');
      
      Logger.success(`Converted: ${baseFilename}.md (${markdownWithMeta.length} chars)`);
      
      return {
        filename: `${baseFilename}.md`,
        title: article.title || link.text,
        excerpt: article.excerpt || '',
        wordCount: markdown.split(/\s+/).length,
        url: link.fullUrl,
        path: link.href
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
    
    let indexContent = `# React Documentation - Markdown Collection

**Generated:** ${new Date().toISOString()}  
**Total Pages:** ${validPages.length}  
**Source:** [React.dev Reference](https://react.dev/reference)

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

    const indexPath = path.join(MARKDOWN_DIR, 'INDEX.md');
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

  async generateIndexOfContents(processedPages) {
    Logger.step('Generating comprehensive index of contents');
    
    const validPages = processedPages.filter(p => p !== null);
    
    // Sort pages by filename to maintain order
    validPages.sort((a, b) => a.filename.localeCompare(b.filename));
    
    let tocContent = `---
title: "React Documentation - Index of Contents"
generated: ${new Date().toISOString()}
total_pages: ${validPages.length}
---

# Index of Contents - React Documentation

> **Complete table of contents with all headers from ${validPages.length} documentation pages**
> 
> **Generated:** ${new Date().toISOString()}  
> **Source:** [React.dev Reference](https://react.dev/reference)

## Navigation

`;

    // Group by chapters for navigation
    const chapters = {};
    validPages.forEach(page => {
      const pathParts = page.path.split('/').filter(p => p);
      const chapterKey = pathParts.length > 2 ? pathParts[2] : 'other';
      
      if (!chapters[chapterKey]) {
        chapters[chapterKey] = [];
      }
      chapters[chapterKey].push(page);
    });

    // Create chapter navigation
    Object.keys(chapters).sort().forEach(chapterKey => {
      const chapterName = chapterKey.charAt(0).toUpperCase() + chapterKey.slice(1);
      tocContent += `- [${chapterName}](#${chapterKey.toLowerCase()})\n`;
    });

    tocContent += '\n---\n\n';

    // Process each page to extract headers
    for (const page of validPages) {
      try {
        const markdownPath = path.join(MARKDOWN_DIR, page.filename);
        const markdownContent = await fs.readFile(markdownPath, 'utf8');
        const headers = await this.extractHeadersFromMarkdown(markdownContent);
        
        if (headers.length > 0) {
          tocContent += `## ${page.title}\n\n`;
          tocContent += `> **File:** [\`${page.filename}\`](${page.filename})  \n`;
          tocContent += `> **URL:** [${page.url}](${page.url})  \n`;
          tocContent += `> **Path:** \`${page.path}\`\n\n`;
          
          headers.forEach(header => {
            const indent = '  '.repeat(header.level - 1);
            tocContent += `${indent}- ${header.text}\n`;
          });
          
          tocContent += '\n';
        }
      } catch (error) {
        Logger.error(`Failed to process headers for ${page.filename}: ${error.message}`);
      }
    }

    tocContent += `\n---\n\n## Statistics\n\n`;
    tocContent += `- **Total Pages:** ${validPages.length}\n`;
    tocContent += `- **Total Word Count:** ${validPages.reduce((sum, page) => sum + page.wordCount, 0).toLocaleString()}\n`;
    tocContent += `- **Generated:** ${new Date().toISOString()}\n`;
    tocContent += `- **Source:** React.dev Reference Documentation\n\n`;
    tocContent += `*This index provides a complete overview of all documentation sections and their hierarchical structure.*\n`;

    const tocPath = path.join(MARKDOWN_DIR, '00-0-index-of-contents.md');
    await fs.writeFile(tocPath, tocContent, 'utf8');
    Logger.success(`Comprehensive index of contents created: 00-0-index-of-contents.md`);
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
      const totalWords = allResults.reduce((sum, page) => sum + page.wordCount, 0);
      
      Logger.success(`Conversion completed: ${successCount}/${htmlFiles.length} files`);
      Logger.info(`Total word count: ${totalWords.toLocaleString()} words`);
      Logger.info(`Markdown files saved in: ${MARKDOWN_DIR}`);
      Logger.info(`Index of contents: ${MARKDOWN_DIR}/00-0-index-of-contents.md`);
      
    } catch (error) {
      Logger.error(`Conversion failed: ${error.message}`);
      throw error;
    }
  }
}

async function main() {
  Logger.info('Starting React Reference HTML-to-Markdown Converter');
  
  try {
    const converter = new MarkdownConverter();
    await converter.convertAllPages();
    Logger.success('HTML-to-Markdown conversion completed successfully');
  } catch (error) {
    Logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
}

main();
