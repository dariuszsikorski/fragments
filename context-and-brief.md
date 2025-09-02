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
✅ Updated all output directory references from `./scripts/output` to `./scripts/react-reference`:
- `run-all-phases.js`: Updated default parameter and result paths
- `01-extract-links.js`: Updated OUTPUT_DIR constant  
- `02-download-html.js`: Updated OUTPUT_DIR and HTML_DIR constants
- `03-convert-markdown.js`: Updated OUTPUT_DIR, HTML_DIR, and MARKDOWN_DIR constants

## Next Steps:
- Commit changes using conventional format from commits.txt
- Test the updated scripts if needed

## Tech Stack:
- React with Vite
- Puppeteer, Cheerio, Mozilla Readability, Turndown
- PNPM package manager
- TypeScript + SCSS
