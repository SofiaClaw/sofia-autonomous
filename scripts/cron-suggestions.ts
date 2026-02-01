/**
 * Proactive Suggestions Cron Job
 * Generates and processes proactive task suggestions
 */

import { config } from 'dotenv';
config();

import { ReportingService } from '../src/services/reportingService';
import { TaskManager } from '../src/services/taskManager';
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

async function generateSuggestions() {
  try {
    logger.info('Starting proactive suggestions generation');

    const reportingService = new ReportingService(convexClient as any);
    const taskManager = new TaskManager(convexClient as any);

    // Generate suggestions
    const suggestions = await reportingService.generateTaskSuggestions();

    logger.info('Suggestions generated', { count: suggestions.length });

    // Auto-create high-priority tasks for critical suggestions
    const criticalSuggestions = suggestions.filter(
      s => s.priority === 'high' || s.priority === 'critical'
    );

    for (const suggestion of criticalSuggestions) {
      logger.info('Auto-creating task from suggestion', { 
        title: suggestion.title,
        priority: suggestion.priority,
      });

      try {
        await taskManager.createTask(
          suggestion.title,
          `${suggestion.description}\n\n**Rationale:** ${suggestion.rationale}`,
          suggestion.type as any,
          suggestion.priority as any,
          {
            createdBy: 'system-suggestion',
            autoAssign: true,
            tags: ['suggestion', 'auto-generated'],
          }
        );
      } catch (error) {
        logger.error('Failed to create task from suggestion', { 
          error, 
          suggestion: suggestion.title 
        });
      }
    }

    // Format and report
    const report = formatSuggestionsReport(suggestions);
    
    logger.info('Suggestions processing complete', {
      total: suggestions.length,
      autoCreated: criticalSuggestions.length,
    });

    // Post report
    console.log('\n' + '='.repeat(60));
    console.log(report);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logger.error('Failed to generate suggestions', { error });
    process.exit(1);
  }
}

function formatSuggestionsReport(suggestions: any[]): string {
  if (suggestions.length === 0) {
    return `✅ **SOFIA Proactive Suggestions**\n\nNo new suggestions at this time. All systems nominal!`;
  }

  const lines = [
    `💡 **SOFIA Proactive Suggestions**`,
    `Generated ${suggestions.length} suggestions for improving the system:`,
    '',
  ];

  const byPriority = {
    critical: suggestions.filter(s => s.priority === 'critical'),
    high: suggestions.filter(s => s.priority === 'high'),
    medium: suggestions.filter(s => s.priority === 'medium'),
    low: suggestions.filter(s => s.priority === 'low'),
  };

  for (const [priority, items] of Object.entries(byPriority)) {
    if (items.length === 0) continue;
    
    const emoji = priority === 'critical' ? '🔴' : 
                  priority === 'high' ? '🟠' : 
                  priority === 'medium' ? '🟡' : '🔵';
    
    lines.push(`${emoji} **${priority.toUpperCase()} (${items.length})**`);
    
    for (const item of items) {
      lines.push(`  • **${item.title}**`);
      lines.push(`    ${item.description.slice(0, 100)}${item.description.length > 100 ? '...' : ''}`);
      lines.push(`    *Rationale: ${item.rationale}*`);
      lines.push('');
    }
  }

  const autoCreated = byPriority.critical.length + byPriority.high.length;
  if (autoCreated > 0) {
    lines.push(`\n🤖 **Auto-created ${autoCreated} high-priority tasks**`);
  }

  return lines.join('\n');
}

// Run if called directly
if (require.main === module) {
  generateSuggestions();
}

export { generateSuggestions };