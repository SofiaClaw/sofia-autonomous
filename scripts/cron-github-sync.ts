/**
 * GitHub Sync Cron Job
 * Syncs GitHub issues to tasks
 */

import { config } from 'dotenv';
config();

import { GitHubService } from '../src/services/github';
import { TaskManager } from '../src/services/taskManager';
import { logger } from '../src/utils/logger';
import { parseIssueBody } from '../src/utils/helpers';

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

async function syncGitHubIssues() {
  try {
    logger.info('Starting GitHub issues sync');

    const github = new GitHubService();
    const taskManager = new TaskManager(convexClient as any);

    // Get open issues
    const issues = await github.listIssues('open', ['sofia-autonomous', 'help wanted']);
    
    logger.info('Found GitHub issues', { count: issues.length });

    let created = 0;
    let skipped = 0;

    for (const issue of issues) {
      // Check if already synced (check for SOFIA Task ID in body)
      if (issue.body.includes('SOFIA Task ID:')) {
        skipped++;
        continue;
      }

      // Parse issue
      const parsed = parseIssueBody(issue.body);
      
      // Determine task type
      let taskType: any = 'code';
      if (issue.labels.includes('bug')) taskType = 'bugfix';
      else if (issue.labels.includes('documentation')) taskType = 'documentation';
      else if (issue.labels.includes('test')) taskType = 'test';
      else if (issue.labels.includes('deploy')) taskType = 'deploy';

      // Determine priority
      let priority: any = 'medium';
      if (issue.labels.includes('critical')) priority = 'critical';
      else if (issue.labels.includes('high-priority')) priority = 'high';
      else if (issue.labels.includes('low-priority')) priority = 'low';

      // Create task
      await taskManager.createTask(
        issue.title,
        parsed.description || issue.body,
        taskType,
        priority,
        {
          createdBy: 'github',
          tags: [...issue.labels, 'github-sync'],
          autoAssign: true,
        }
      );

      // Add comment to issue
      await github.addIssueComment(
        issue.number,
        `🤖 **SOFIA Autonomous** has created a task for this issue.\n\n` +
        `This task has been added to the SOFIA queue and will be processed by an available agent.\n\n` +
        `You can track progress through the SOFIA admin dashboard.`
      );

      created++;
      logger.info('Created task from GitHub issue', { 
        issueNumber: issue.number,
        title: issue.title,
      });
    }

    logger.info('GitHub sync complete', { 
      total: issues.length,
      created,
      skipped,
    });

  } catch (error) {
    logger.error('GitHub sync failed', { error });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncGitHubIssues();
}

export { syncGitHubIssues };