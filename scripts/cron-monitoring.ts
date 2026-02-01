/**
 * Performance Monitoring Cron Job
 * Monitors system performance and alerts on issues
 */

import { config } from 'dotenv';
config();

import { ReportingService } from '../src/services/reportingService';
import { AgentService } from '../src/services/agentService';
import { OpenClawService } from '../src/services/openclaw';
import { GitHubService } from '../src/services/github';
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

interface HealthStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details?: any;
}

async function runPerformanceMonitoring() {
  try {
    logger.info('Starting performance monitoring check');

    const healthStatuses: HealthStatus[] = [];
    const alerts: string[] = [];

    // Check OpenClaw Gateway
    const openclaw = new OpenClawService();
    const openclawHealth = await openclaw.healthCheck();
    
    healthStatuses.push({
      component: 'OpenClaw Gateway',
      status: openclawHealth.healthy ? 'healthy' : 'unhealthy',
      message: openclawHealth.healthy 
        ? 'Connected and responsive' 
        : `Error: ${openclawHealth.error}`,
      details: { version: openclawHealth.version },
    });

    if (!openclawHealth.healthy) {
      alerts.push('🚨 OpenClaw Gateway is unreachable - sub-agent spawning may fail');
    }

    // Check GitHub API
    const github = new GitHubService();
    try {
      await github.getRepository();
      healthStatuses.push({
        component: 'GitHub API',
        status: 'healthy',
        message: 'Connected and authenticated',
      });
    } catch (error) {
      healthStatuses.push({
        component: 'GitHub API',
        status: 'unhealthy',
        message: `Error: ${(error as Error).message}`,
      });
      alerts.push('🚨 GitHub API connection failed - code operations will be affected');
    }

    // Check Agent Health
    const agentService = new AgentService(convexClient as any);
    const agentStats = await agentService.getSystemStats();
    
    const agentStatus = agentStats.offline > agentStats.total * 0.5 
      ? 'degraded' 
      : agentStats.error > 0 
        ? 'degraded' 
        : 'healthy';
    
    healthStatuses.push({
      component: 'Agent Pool',
      status: agentStatus,
      message: `${agentStats.online}/${agentStats.total} agents online, ${agentStats.busy} busy`,
      details: agentStats,
    });

    if (agentStats.offline > 0) {
      alerts.push(`⚠️ ${agentStats.offline} agents are offline`);
    }
    if (agentStats.idle === 0 && agentStats.busy > 0) {
      alerts.push('⚠️ All agents are busy - task queue may grow');
    }

    // Generate Performance Metrics
    const reportingService = new ReportingService(convexClient as any);
    const metrics = await reportingService.generatePerformanceMetrics();

    // Check task completion rate
    const completionRate = metrics.totalTasks > 0 
      ? (metrics.completedTasks / metrics.totalTasks) * 100 
      : 100;

    if (completionRate < 70) {
      alerts.push(`⚠️ Task completion rate is low (${completionRate.toFixed(1)}%)`);
    }

    // Check failure rate
    if (metrics.failedTasks > metrics.completedTasks) {
      alerts.push('🚨 Failure rate is high - investigate recent errors');
    }

    // Check for stale tasks
    const staleTasks = await convexClient.query('tasks:stale', { olderThanDays: 3 });
    if (staleTasks.length > 5) {
      alerts.push(`⚠️ ${staleTasks.length} tasks are stale (>3 days without update)`);
    }

    // Generate report
    const report = formatMonitoringReport(healthStatuses, alerts, metrics);
    
    logger.info('Performance monitoring complete', {
      healthy: healthStatuses.filter(h => h.status === 'healthy').length,
      degraded: healthStatuses.filter(h => h.status === 'degraded').length,
      unhealthy: healthStatuses.filter(h => h.status === 'unhealthy').length,
      alerts: alerts.length,
    });

    // Output report
    console.log('\n' + '='.repeat(60));
    console.log(report);
    console.log('='.repeat(60) + '\n');

    // If critical alerts, could send notifications here
    if (alerts.some(a => a.includes('🚨'))) {
      await sendCriticalAlert(alerts);
    }

  } catch (error) {
    logger.error('Performance monitoring failed', { error });
    process.exit(1);
  }
}

function formatMonitoringReport(
  statuses: HealthStatus[],
  alerts: string[],
  metrics: any
): string {
  const lines = [
    `🏥 **SOFIA Performance Monitoring Report**`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `**System Health**`,
  ];

  for (const status of statuses) {
    const emoji = status.status === 'healthy' ? '✅' : 
                  status.status === 'degraded' ? '⚠️' : '❌';
    lines.push(`${emoji} **${status.component}**: ${status.message}`);
  }

  lines.push('');
  lines.push(`**Today's Metrics**`);
  lines.push(`• Total Tasks: ${metrics.totalTasks}`);
  lines.push(`• Completed: ${metrics.completedTasks}`);
  lines.push(`• Failed: ${metrics.failedTasks}`);
  lines.push(`• Avg Completion Time: ${formatDuration(metrics.averageCompletionTime)}`);

  if (alerts.length > 0) {
    lines.push('');
    lines.push(`**Alerts (${alerts.length})**`);
    lines.push(...alerts);
  } else {
    lines.push('');
    lines.push(`✅ No alerts - all systems operating normally`);
  }

  return lines.join('\n');
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.round(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

async function sendCriticalAlert(alerts: string[]): Promise<void> {
  // Could integrate with PagerDuty, Opsgenie, etc.
  logger.error('Critical alerts detected', { alerts });
  
  // For now, just ensure logs capture this
  console.error('\n🔴 CRITICAL ALERTS DETECTED:');
  for (const alert of alerts) {
    console.error(alert);
  }
}

// Run if called directly
if (require.main === module) {
  runPerformanceMonitoring();
}

export { runPerformanceMonitoring };