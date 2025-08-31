# Scripts

## scrape-react-dev.js

Puppeteer script that visits https://react.dev/reference and extracts sidebar navigation with link parsing.

### Features

- Extracts React reference sidebar navigation using CSS selector `nav[role="navigation"]`
- Parses HTML with Cheerio to extract all links as structured data
- Saves HTML content and parsed JSON links with timestamps
- Outputs parsed links as JavaScript object in console

### Usage

```bash
# Run the script
pnpm scrape

# Or directly with node
node scripts/scrape-react-dev.js
```

### Output

Creates `scripts/output/` directory with:
- `react-reference-sidebar-{timestamp}.html` - Raw sidebar HTML
- `react-reference-full-{timestamp}.html` - Complete page content  
- `react-reference-links-{timestamp}.json` - Parsed links as JSON array

Each link object contains:
```javascript
{
  "href": "/reference/react/useState",
  "title": "useState", 
  "text": "useState",
  "fullUrl": "https://react.dev/reference/react/useState"
}
```

### Dependencies

- puppeteer - Browser automation
- cheerio - Server-side HTML parsing
- Built-in Node.js modules (fs/promises, path)

### Extracted Content

Successfully parses 100+ links across:
- react@19.1 (Hooks, Components, APIs)
- react-dom@19.1 (Hooks, Components, Client/Server/Static APIs)
- React Compiler (Configuration, Directives)
- Rules of React
- React Server Components  
- Legacy APIs

