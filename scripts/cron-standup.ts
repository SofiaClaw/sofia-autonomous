/**
 * Daily Standup Cron Job
 * Generates and posts daily standup reports
 */

import { config } from 'dotenv';
config();

import { ReportingService } from '../src/services/reportingService';
import { logger } from '../src/utils/logger';

// Placeholder Convex client
const convexClient = {
  mutation: async (name: string, args: any) => {
    logger.debug('Convex mutation', { name, args });
    return { _id: 'mock_id' };
  },
  query: async (name: string, args: any) => {
    logger.debug('Convex query', { name, args });
    return [];
  },
};

async function generateDailyStandup() {
  try {
    logger.info('Starting daily standup generation');

    const reportingService = new ReportingService(convexClient as any);
    const standup = await reportingService.generateDailyStandup();

    // Format standup for display
    const report = formatStandupReport(standup);
    
    logger.info('Daily standup generated', {
      date: standup.date,
      completed: standup.completedTasks.length,
      inProgress: standup.inProgressTasks.length,
    });

    // Post to configured channels (Slack, Discord, etc.)
    await postToChannels(report);

    logger.info('Daily standup posted successfully');
  } catch (error) {
    logger.error('Failed to generate daily standup', { error });
    process.exit(1);
  }
}

function formatStandupReport(standup: any): string {
  const lines = [
    `📊 **SOFIA Daily Standup - ${standup.date}**`,
    '',
    `✅ **Completed (${standup.completedTasks.length})**`,
    ...standup.completedTasks.map((t: any) => `  • ${t.title} (${t.assignee})`),
    '',
    `🔄 **In Progress (${standup.inProgressTasks.length})**`,
    ...standup.inProgressTasks.map((t: any) => `  • ${t.title} (${t.assignee})`),
    '',
    `⏳ **Pending (${standup.pendingTasks.length})**`,
    ...standup.pendingTasks.slice(0, 5).map((t: any) => `  • ${t.title}`),
    standup.pendingTasks.length > 5 ? `  ... and ${standup.pendingTasks.length - 5} more` : '',
    '',
  ];

  if (standup.failedTasks.length > 0) {
    lines.push(`❌ **Failed (${standup.failedTasks.length})**`);
    lines.push(...standup.failedTasks.map((t: any) => `  • ${t.title}`));
    lines.push('');
  }

  if (standup.insights.length > 0) {
    lines.push(`💡 **Insights**`);
    lines.push(...standup.insights.map((i: string) => `  • ${i}`));
    lines.push('');
  }

  if (standup.blockers.length > 0) {
    lines.push(`🚧 **Blockers**`);
    lines.push(...standup.blockers.map((b: string) => `  • ${b}`));
    lines.push('');
  }

  if (standup.suggestions.length > 0) {
    lines.push(`💭 **Suggestions**`);
    lines.push(...standup.suggestions.map((s: string) => `  • ${s}`));
  }

  return lines.join('\n');
}

async function postToChannels(report: string): Promise<void> {
  // Post to Slack if configured
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const { default: fetch } = await import('node-fetch');
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: report }),
      });
      logger.info('Standup posted to Slack');
    } catch (error) {
      logger.error('Failed to post to Slack', { error });
    }
  }

  // Post to Discord if configured
  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      const { default: fetch } = await import('node-fetch');
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: report }),
      });
      logger.info('Standup posted to Discord');
    } catch (error) {
      logger.error('Failed to post to Discord', { error });
    }
  }

  // Log to console as fallback
  console.log('\n' + '='.repeat(60));
  console.log(report);
  console.log('='.repeat(60) + '\n');
}

// Run if called directly
if (require.main === module) {
  generateDailyStandup();
}

export { generateDailyStandup };