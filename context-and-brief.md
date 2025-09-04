# Fragments Project - Context & Brief

**Last Updated:** 2025-09-05  
**Task:** Enhanced React scraper with index generation and performance improvements

## Project Structure
- `/docs` - Single image file
- `/react` - React app with enhanced scraping scripts
- `/website` - Next.js website

## React Scraper Scripts Analysis
Located in `react/scripts/`:

### Enhanced Pipeline Scripts:
1. **`run-all-phases.js`** - Main coordinator, runs all phases sequentially
2. **`01-extract-links.js`** - Scrapes React.dev sidebar links (101 links)
3. **`02-download-html.js`** - Downloads HTML pages (20 concurrent) with smart skipping
4. **`03-convert-markdown.js`** - Converts HTML to markdown (20 concurrent) + index generation

### New Features Implemented:
✅ **Increased Concurrency:** Downloads 20 pages at once instead of 10 for faster processing
✅ **Smart File Skipping:** Compares file hashes to skip downloading identical HTML files
✅ **Index of Contents Generation:** Creates `00-0-index-of-contents.md` with all headers from all files

### Key Features:
- Uses Puppeteer for scraping with 20 concurrent pages
- Cheerio for HTML parsing
- Mozilla Readability + Turndown for clean markdown conversion
- Organized naming: `{chapter}-{section}-{title}` format
- Smart hash-based file comparison to avoid redundant downloads
- Comprehensive index extraction from markdown headers (# ## ### ####)
- Concurrent processing with batch management
- Smart cleanup and error handling

## Changes Made:
✅ **Performance Improvements:**
- Increased CONCURRENT_LIMIT from 10 to 20 in both download and conversion scripts
- Added file hash comparison to skip identical downloads
- Enhanced logging with download/skip statistics

✅ **Index of Contents Feature:**
- Added `extractHeadersFromMarkdown()` method to parse headers from markdown files
- Added `generateIndexOfContents()` method to create comprehensive navigation
- Creates `00-0-index-of-contents.md` with structured hierarchy of all headers
- Updated pipeline result messages to highlight new index file

✅ **Smart File Management:**
- Added crypto import for SHA-256 hash comparison
- Added `checkExistingFile()` method for content comparison
- Enhanced result tracking with skipped file statistics
- Improved logging to show download vs skip counts

## Commits Created:
- b194eb8 - perf: increase download concurrency to 20 (2025-09-03 18:45:00)
- 76bd673 - feat: skip downloading identical HTML files (2025-09-04 10:15:22)
- 7c31620 - feat: generate comprehensive index of contents (2025-09-04 14:33:17)

## Enhanced Output:
- **Main Index:** `INDEX.md` - Simple category-based navigation
- **Detailed Index:** `00-0-index-of-contents.md` - Complete header hierarchy from all pages
- **Statistics:** Enhanced reporting with download/skip counts and comprehensive metrics
- **Performance:** 2x faster with 20 concurrent operations and smart skipping

## Tech Stack:
- React with Vite
- Puppeteer (20 concurrent pages), Cheerio, Mozilla Readability, Turndown
- SHA-256 hash comparison for file deduplication
- PNPM package manager
- TypeScript + SCSS

