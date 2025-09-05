#!/usr/bin/env node

/**
 * Pipeline Runner: All Phases (Unified)
 * Executes all 3 phases sequentially: extract links → download HTML → convert markdown
 * 
 * Usage: node run-all-phases-unified.js --mode <reference|learn|both>
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const SCRIPTS_DIR = '.';

// Mode-specific configurations
const MODE_CONFIGS = {
  reference: {
    outputDir: './react-reference',
    sectionName: 'Reference',
    description: 'React Reference Documentation',
    timestampPatterns: [
      'react-reference-links-',
      'react-reference-sidebar-',
      'react-reference-full-',
      'download-summary-'
    ]
  },
  learn: {
    outputDir: './react-learn',
    sectionName: 'Learn',
    description: 'React Learn Documentation',
    timestampPatterns: [
      'react-learn-links-',
      'react-learn-sidebar-',
      'react-learn-full-',
      'download-summary-'
    ]
  }
};

function printUsage() {
  console.log(`
Usage: node run-all-phases-unified.js --mode <mode>

Execute the complete React documentation scraping pipeline.

Options:
  --mode <mode>     Pipeline mode (required)
                    Available modes: reference, learn, both
  --help, -h        Show this help message

Examples:
  node run-all-phases-unified.js --mode reference
  node run-all-phases-unified.js --mode learn
  node run-all-phases-unified.js --mode both

Output:
  reference mode: Processes to ./react-reference/
  learn mode:     Processes to ./react-learn/
  both mode:      Processes both sequentially

Pipeline Phases:
  1. Extract Links:    Scrape sidebar navigation
  2. Download HTML:    Download original pages (20 concurrent)
  3. Convert Markdown: Convert to markdown with Mozilla Readability
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
  if (!['reference', 'learn', 'both'].includes(mode)) {
    console.error(`Error: Invalid mode "${mode}". Available modes: reference, learn, both`);
    printUsage();
    process.exit(1);
  }
  
  return { mode };
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
  
  static phase(number, name) {
    console.log(`\n=== PHASE ${number}: ${name.toUpperCase()} ===`);
  }
  
  static mode(mode) {
    console.log(`\n🚀 === PROCESSING MODE: ${mode.toUpperCase()} ===`);
  }
}

// Cleanup Functions
async function removeDirectory(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    if (stats.isDirectory()) {
      const files = await fs.readdir(dirPath);
      
      await Promise.all(files.map(async (file) => {
        const filePath = path.join(dirPath, file);
        const fileStats = await fs.stat(filePath);
        
        if (fileStats.isDirectory()) {
          await removeDirectory(filePath);
        } else {
          await fs.unlink(filePath);
        }
      }));
      
      await fs.rmdir(dirPath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function removeFilesByPattern(dirPath, patterns) {
  try {
    const files = await fs.readdir(dirPath);
    let removedCount = 0;
    
    for (const file of files) {
      const shouldRemove = patterns.some(pattern => {
        if (typeof pattern === 'string') {
          return file.includes(pattern);
        }
        if (pattern instanceof RegExp) {
          return pattern.test(file);
        }
        return false;
      });
      
      if (shouldRemove) {
        await fs.unlink(path.join(dirPath, file));
        removedCount++;
        Logger.step(`Removed: ${file}`);
      }
    }
    
    return removedCount;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return 0;
  }
}

async function ensureCleanDirectories(outputDir, timestampPatterns) {
  Logger.step('Starting cleanup of old crawling results');
  
  try {
    // Remove HTML and markdown directories completely
    const htmlDir = path.join(outputDir, 'html');
    const markdownDir = path.join(outputDir, 'markdown');
    
    Logger.step('Removing HTML directory');
    await removeDirectory(htmlDir);
    Logger.success('HTML directory cleaned');
    
    Logger.step('Removing markdown directory');
    await removeDirectory(markdownDir);
    Logger.success('Markdown directory cleaned');
    
    // Remove old timestamp files
    Logger.step('Removing old timestamp files');
    const removedFiles = await removeFilesByPattern(outputDir, timestampPatterns);
    Logger.success(`Removed ${removedFiles} old timestamp files`);
    
    // Recreate necessary directories
    const htmlDirPath = path.join(outputDir, 'html');
    const markdownDirPath = path.join(outputDir, 'markdown');
    
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(htmlDirPath, { recursive: true });
    await fs.mkdir(markdownDirPath, { recursive: true });
    
    Logger.success('Cleanup completed successfully');
  } catch (error) {
    Logger.error(`Cleanup failed: ${error.message}`);
    throw error;
  }
}

async function runScript(scriptPath, phaseName, mode) {
  return new Promise((resolve, reject) => {
    Logger.info(`Starting ${phaseName}`);
    
    const args = mode ? ['--mode', mode] : [];
    const child = spawn('node', [scriptPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });
    
    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        Logger.success(`${phaseName} completed successfully`);
        resolve(output);
      } else {
        Logger.error(`${phaseName} failed with exit code ${code}`);
        reject(new Error(`${phaseName} failed: ${errorOutput}`));
      }
    });
    
    child.on('error', (error) => {
      Logger.error(`Failed to start ${phaseName}: ${error.message}`);
      reject(error);
    });
  });
}

async function runSingleMode(mode) {
  const config = MODE_CONFIGS[mode];
  
  Logger.mode(mode);
  Logger.info(`Starting React ${config.sectionName} Documentation Scraper - Full Pipeline`);
  
  // Clean old results before starting
  try {
    Logger.phase(0, 'Cleanup Old Results');
    Logger.info('Removing old crawling results and preparing clean directories');
    await ensureCleanDirectories(config.outputDir, config.timestampPatterns);
    Logger.success('Cleanup completed successfully');
  } catch (error) {
    Logger.error(`Cleanup failed: ${error.message}`);
    throw error;
  }
  
  const phases = [
    {
      number: 1,
      name: 'Extract Sidebar Links',
      script: path.join(SCRIPTS_DIR, '01-extract-links-unified.js'),
      description: `Scraping sidebar navigation and extracting ${config.sectionName} section links`
    },
    {
      number: 2, 
      name: 'Download HTML Pages',
      script: path.join(SCRIPTS_DIR, '02-download-html-unified.js'),
      description: `Downloading original HTML content from all ${config.sectionName} pages (20 concurrent)`
    },
    {
      number: 3,
      name: 'Convert to Markdown',
      script: path.join(SCRIPTS_DIR, '03-convert-markdown-unified.js'), 
      description: `Converting HTML files to markdown using Mozilla Reader Mode (20 concurrent)`
    }
  ];
  
  try {
    for (const phase of phases) {
      Logger.phase(phase.number, phase.name);
      Logger.info(phase.description);
      
      await runScript(phase.script, phase.name, mode);
      
      Logger.success(`Phase ${phase.number} completed`);
    }
    
    Logger.success(`${config.sectionName} pipeline completed successfully!`);
    console.log(`\n=== ${mode.toUpperCase()} RESULTS ===`);
    console.log('✓ Sidebar links extracted → JSON');
    console.log('✓ HTML pages downloaded → /html'); 
    console.log('✓ Markdown files generated → /markdown');
    console.log('✓ Index of contents created → 00-0-index-of-contents.md');
    console.log(`\nCheck: ${config.outputDir}/markdown/ for generated documentation`);
    console.log(`Open: ${config.outputDir}/markdown/00-0-index-of-contents.md for complete navigation`);
    
  } catch (error) {
    Logger.error(`${config.sectionName} pipeline failed: ${error.message}`);
    throw error;
  }
}

async function runBothModes() {
  Logger.info('Starting BOTH React Documentation Scrapers - Full Pipeline');
  
  try {
    // Run reference mode first
    await runSingleMode('reference');
    
    console.log('\n' + '='.repeat(80));
    console.log('REFERENCE MODE COMPLETED - STARTING LEARN MODE');
    console.log('='.repeat(80));
    
    // Run learn mode second
    await runSingleMode('learn');
    
    Logger.success('BOTH pipelines completed successfully!');
    console.log('\n' + '='.repeat(80));
    console.log('🎉 === FINAL RESULTS (BOTH MODES) ===');
    console.log('='.repeat(80));
    console.log('\n✅ REFERENCE DOCUMENTATION:');
    console.log('   📁 ./react-reference/markdown/');
    console.log('   📋 ./react-reference/markdown/00-0-index-of-contents.md');
    console.log('\n✅ LEARN DOCUMENTATION:');
    console.log('   📁 ./react-learn/markdown/');
    console.log('   📋 ./react-learn/markdown/00-0-index-of-contents.md');
    console.log('\n🚀 Complete React documentation is now available in markdown format!');
    
  } catch (error) {
    Logger.error(`Combined pipeline failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  const { mode } = parseArgs();
  
  try {
    if (mode === 'both') {
      await runBothModes();
    } else {
      await runSingleMode(mode);
    }
    
  } catch (error) {
    Logger.error(`Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

main();
