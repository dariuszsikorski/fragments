#!/usr/bin/env node

/**
 * Pipeline Runner: All Phases
 * Executes all 3 phases sequentially: extract links → download HTML → convert markdown
 * Usage: pnpm docs
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const SCRIPTS_DIR = '.';

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

async function ensureCleanDirectories(outputDir = './react-reference') {
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
    const timestampPatterns = [
      'react-reference-links-',
      'react-reference-sidebar-',
      'react-reference-full-',
      'download-summary-'
    ];
    
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

async function runScript(scriptPath, phaseName) {
  return new Promise((resolve, reject) => {
    Logger.info(`Starting ${phaseName}`);
    
    const child = spawn('node', [scriptPath], {
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

async function main() {
  Logger.info('Starting React Documentation Scraper - Full Pipeline');
  
  // Clean old results before starting
  try {
    Logger.phase(0, 'Cleanup Old Results');
    Logger.info('Removing old crawling results and preparing clean directories');
    await ensureCleanDirectories('./react-reference');
    Logger.success('Cleanup completed successfully');
  } catch (error) {
    Logger.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
  }
  
  const phases = [
    {
      number: 1,
      name: 'Extract Sidebar Links',
      script: path.join(SCRIPTS_DIR, '01-extract-links.js'),
      description: 'Scraping sidebar navigation and extracting reference links'
    },
    {
      number: 2, 
      name: 'Download HTML Pages',
      script: path.join(SCRIPTS_DIR, '02-download-html.js'),
      description: 'Downloading original HTML content from all reference pages (10 concurrent)'
    },
    {
      number: 3,
      name: 'Convert to Markdown',
      script: path.join(SCRIPTS_DIR, '03-convert-markdown.js'), 
      description: 'Converting HTML files to markdown using Mozilla Reader Mode (10 concurrent)'
    }
  ];
  
  try {
    for (const phase of phases) {
      Logger.phase(phase.number, phase.name);
      Logger.info(phase.description);
      
      await runScript(phase.script, phase.name);
      
      Logger.success(`Phase ${phase.number} completed`);
    }
    
    Logger.success('Full pipeline completed successfully!');
    console.log('\n=== RESULTS ===');
    console.log('✓ Sidebar links extracted → JSON');
    console.log('✓ HTML pages downloaded → /html'); 
    console.log('✓ Markdown files generated → /markdown');
    console.log('\nCheck: ./react-reference/markdown/ for generated documentation');
    console.log('Open: ./react-reference/markdown/INDEX.md for navigation');
    
  } catch (error) {
    Logger.error(`Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

main();
