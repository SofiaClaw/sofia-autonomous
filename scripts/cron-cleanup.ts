/**
 * Cleanup Cron Job
 * Removes old sessions and temporary files
 */

import { config } from 'dotenv';
config();

import { readdir, stat, unlink, rmdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../src/utils/logger';

// Placeholder Convex client
const convexClient = {
  mutation: async (name: string, args: any) => {
    logger.debug('Convex mutation', { name, args });
    return { success: true };
  },
  query: async (name: string, args: any) => {
    logger.debug('Convex query', { name, args });
    return [];
  },
};

async function runCleanup() {
  try {
    logger.info('Starting cleanup job');

    const results = {
      sessionsDeleted: 0,
      logsCleaned: 0,
      tempFilesDeleted: 0,
      errors: [] as string[],
    };

    // Clean up old sessions (older than 30 days)
    try {
      const deleted = await convexClient.mutation('sessions:cleanupOld', {
        olderThanDays: 30,
      });
      results.sessionsDeleted = deleted || 0;
      logger.info('Cleaned up old sessions', { deleted: results.sessionsDeleted });
    } catch (error) {
      results.errors.push(`Session cleanup: ${(error as Error).message}`);
    }

    // Clean up old log files
    try {
      const logsDir = join(process.cwd(), 'logs');
      const files = await readdir(logsDir);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const file of files) {
        const filePath = join(logsDir, file);
        const fileStat = await stat(filePath);

        if (fileStat.mtime.getTime() < cutoff) {
          await unlink(filePath);
          results.logsCleaned++;
        }
      }

      logger.info('Cleaned up old log files', { deleted: results.logsCleaned });
    } catch (error) {
      // Logs dir might not exist
      logger.debug('Log cleanup skipped', { error: (error as Error).message });
    }

    // Clean up temp files
    try {
      const tempDirs = [
        join(process.cwd(), 'tmp'),
        join(process.cwd(), '.temp'),
        '/tmp/sofia-*',
      ];

      for (const dir of tempDirs) {
        try {
          const files = await readdir(dir);
          const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 1 day

          for (const file of files) {
            const filePath = join(dir, file);
            const fileStat = await stat(filePath);

            if (fileStat.mtime.getTime() < cutoff) {
              if (fileStat.isDirectory()) {
                await rmdir(filePath, { recursive: true });
              } else {
                await unlink(filePath);
              }
              results.tempFilesDeleted++;
            }
          }
        } catch (error) {
          // Directory might not exist
          continue;
        }
      }

      logger.info('Cleaned up temp files', { deleted: results.tempFilesDeleted });
    } catch (error) {
      results.errors.push(`Temp cleanup: ${(error as Error).message}`);
    }

    // Log results
    logger.info('Cleanup complete', results);

    console.log('\n' + '='.repeat(60));
    console.log('🧹 SOFIA Cleanup Report');
    console.log('='.repeat(60));
    console.log(`  Sessions deleted: ${results.sessionsDeleted}`);
    console.log(`  Log files cleaned: ${results.logsCleaned}`);
    console.log(`  Temp files deleted: ${results.tempFilesDeleted}`);
    
    if (results.errors.length > 0) {
      console.log('\n  Errors:');
      for (const error of results.errors) {
        console.log(`    ⚠️ ${error}`);
      }
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logger.error('Cleanup job failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup();
}

export { runCleanup };