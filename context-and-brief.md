# Fragments Project - Context & Brief

**Last Updated:** 2025-09-05  
**Task:** Update scraper scripts output directory from `output` to `react-reference`

## Project Structure
- `/docs` - Single image file
- `/react` - React app with scraping scripts
- `/website` - Next.js website

## React Scraper Scripts Analysis
Located in `react/scripts/`:

### Pipeline Scripts:
1. **`run-all-phases.js`** - Main coordinator, runs all phases sequentially
2. **`01-extract-links.js`** - Scrapes React.dev sidebar links
3. **`02-download-html.js`** - Downloads HTML pages (10 concurrent)
4. **`03-convert-markdown.js`** - Converts HTML to markdown using Mozilla Readability

### Key Features:
- Uses Puppeteer for scraping
- Cheerio for HTML parsing
- Mozilla Readability + Turndown for clean markdown conversion
- Organized naming: `{chapter}-{section}-{title}` format
- Concurrent processing (10 parallel)
- Smart cleanup and error handling

## Changes Made:
✅ Updated all output directory references from `./scripts/output` to `./react-reference`:
- `run-all-phases.js`: Updated default parameter and result paths, fixed SCRIPTS_DIR constant
- `01-extract-links.js`: Updated OUTPUT_DIR constant  
- `02-download-html.js`: Updated OUTPUT_DIR and HTML_DIR constants
- `03-convert-markdown.js`: Updated OUTPUT_DIR, HTML_DIR, and MARKDOWN_DIR constants

✅ Fixed path issues:
- Corrected SCRIPTS_DIR from './scripts' to '.' (avoiding double scripts path)
- Fixed all directory references to use './react-reference' instead of './scripts/react-reference'

✅ Tested and verified:
- Scripts run successfully with new directory structure
- New `react-reference` folder created and populated correctly at scripts level
- All 101 React documentation links extracted successfully

## Commits Created:
- 63fafdf - refactor: output to react-reference folder (2025-09-02 09:55:33)
- 2c42539 - fix: correct scripts directory path (2025-09-02 15:17:42) 
- 9bcb29a - fix: correct react-reference path references (2025-09-02 19:28:16)

## Tech Stack:
- React with Vite
- Puppeteer, Cheerio, Mozilla Readability, Turndown
- PNPM package manager
- TypeScript + SCSS
