#!/usr/bin/env node

/**
 * Interactive Docker Development Logs Viewer
 * 
 * Prompts user to select which service logs to view
 */

const { spawn } = require('child_process');
const readline = require('readline');

const SERVICES = [
  { name: 'All Services', value: '' },
  { name: 'Gate (NestJS API)', value: 'gate' },
  { name: 'Scribe API (FastAPI)', value: 'scribe-api' },
  { name: 'Scribe Worker (Celery)', value: 'scribe-worker' },
  { name: 'PostgreSQL', value: 'postgres-archeon' },
  { name: 'Redis', value: 'redis-archeon' },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function printMenu() {
  clearScreen();
  console.log('\n🐳 Archeon Development Logs\n');
  console.log('Select a service to view logs:\n');
  
  SERVICES.forEach((service, index) => {
    console.log(`  ${index + 1}. ${service.name}`);
  });
  
  console.log('\n  0. Exit\n');
}

function viewLogs(service) {
  const args = [
    '-f', 'docker/docker-compose.dev.yml',
    'logs',
    '-f',
    '--tail=100',
  ];
  
  if (service) {
    args.push(service);
  }
  
  console.log(`\n📋 Viewing logs${service ? ` for ${service}` : ' for all services'}...\n`);
  console.log('Press Ctrl+C to stop\n');
  
  const proc = spawn('docker-compose', args, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  
  proc.on('error', (err) => {
    console.error('Failed to start docker-compose:', err.message);
    process.exit(1);
  });
  
  proc.on('close', (code) => {
    process.exit(code || 0);
  });
}

function prompt() {
  printMenu();
  
  rl.question('Enter your choice (0-6): ', (answer) => {
    const choice = parseInt(answer, 10);
    
    if (choice === 0) {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
    }
    
    if (choice >= 1 && choice <= SERVICES.length) {
      rl.close();
      viewLogs(SERVICES[choice - 1].value);
    } else {
      console.log('\n❌ Invalid choice. Please try again.\n');
      setTimeout(prompt, 1000);
    }
  });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!\n');
  process.exit(0);
});

// Start the interactive prompt
prompt();
