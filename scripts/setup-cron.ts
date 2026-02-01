/**
 * Cron Job Setup Script
 * Configures cron jobs for SOFIA autonomous system
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../src/utils/logger';

interface CronJob {
  name: string;
  schedule: string;
  script: string;
  description: string;
}

const CRON_JOBS: CronJob[] = [
  {
    name: 'sofia-standup',
    schedule: '0 9 * * *', // 9 AM daily
    script: 'npx tsx scripts/cron-standup.ts',
    description: 'Generate and post daily standup report',
  },
  {
    name: 'sofia-suggestions',
    schedule: '0 */4 * * *', // Every 4 hours
    script: 'npx tsx scripts/cron-suggestions.ts',
    description: 'Generate proactive task suggestions',
  },
  {
    name: 'sofia-monitoring',
    schedule: '*/15 * * * *', // Every 15 minutes
    script: 'npx tsx scripts/cron-monitoring.ts',
    description: 'Performance monitoring and health checks',
  },
  {
    name: 'sofia-github-sync',
    schedule: '*/5 * * * *', // Every 5 minutes
    script: 'npx tsx scripts/cron-github-sync.ts',
    description: 'Sync GitHub issues to tasks',
  },
  {
    name: 'sofia-cleanup',
    schedule: '0 2 * * *', // 2 AM daily
    script: 'npx tsx scripts/cron-cleanup.ts',
    description: 'Clean up old sessions and logs',
  },
];

function setupCronJobs() {
  try {
    logger.info('Setting up SOFIA cron jobs');

    // Ensure scripts directory exists
    const scriptsDir = join(process.cwd(), 'scripts');
    if (!existsSync(scriptsDir)) {
      mkdirSync(scriptsDir, { recursive: true });
    }

    // Create crontab entries
    const crontabEntries: string[] = [
      '# SOFIA Autonomous System Cron Jobs',
      '# Generated automatically - do not edit manually',
      '',
      `SHELL=/bin/bash`,
      `PATH=/usr/local/bin:/usr/bin:/bin`,
      `WORKSPACE_DIR=${process.cwd()}`,
      `ADMIN_API_KEY=${process.env.ADMIN_API_KEY || ''}`,
      '',
    ];

    for (const job of CRON_JOBS) {
      const logFile = join(process.cwd(), 'logs', `${job.name}.log`);
      const entry = `${job.schedule} cd ${process.cwd()} && ${job.script} >> ${logFile} 2>&1 # ${job.description}`;
      crontabEntries.push(entry);
      
      logger.info('Added cron job', { 
        name: job.name, 
        schedule: job.schedule,
        description: job.description,
      });
    }

    // Write crontab file
    const crontabContent = crontabEntries.join('\n') + '\n';
    const crontabPath = join(process.cwd(), 'sofia-crontab');
    writeFileSync(crontabPath, crontabContent);

    // Install crontab
    try {
      execSync(`crontab ${crontabPath}`, { stdio: 'inherit' });
      logger.info('Crontab installed successfully');
    } catch (error) {
      logger.error('Failed to install crontab', { error });
      logger.info('Crontab file created at:', crontabPath);
      logger.info('Install manually with: crontab ' + crontabPath);
    }

    // Ensure log directory exists
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    logger.info('Cron job setup complete', { 
      jobsInstalled: CRON_JOBS.length,
      crontabPath,
    });

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📅 SOFIA Cron Jobs Configured');
    console.log('='.repeat(60));
    for (const job of CRON_JOBS) {
      console.log(`  ${job.schedule.padEnd(15)} ${job.name}`);
      console.log(`  ${''.padEnd(15)} ${job.description}`);
      console.log();
    }
    console.log('='.repeat(60));
    console.log('Use "crontab -l" to view installed jobs');
    console.log('Use "crontab -r" to remove all jobs');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logger.error('Cron setup failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupCronJobs();
}

export { setupCronJobs, CRON_JOBS };