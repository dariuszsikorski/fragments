#!/usr/bin/env node

/**
 * Pipeline Runner: All Phases
 * Executes all 3 phases sequentially: extract links → download HTML → convert markdown
 * Usage: pnpm docs
 */

import { spawn } from 'child_process';
import path from 'path';

const SCRIPTS_DIR = './scripts';

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
  
  static phase(number, name) {
    console.log(`\n=== PHASE ${number}: ${name.toUpperCase()} ===`);
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
    console.log('\nCheck: ./scripts/output/markdown/ for generated documentation');
    console.log('Open: ./scripts/output/markdown/INDEX.md for navigation');
    
  } catch (error) {
    Logger.error(`Pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

main();
