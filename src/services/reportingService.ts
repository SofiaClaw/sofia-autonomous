/**
 * Standup & Reporting Service
 * Generates daily standups, performance reports, and insights
 */

import { DailyStandup, PerformanceMetrics, Task, TaskSummary } from '../types';
import { logger } from '../utils/logger';

interface ConvexClient {
  query: (name: string, args: any) => Promise<any>;
  mutation: (name: string, args: any) => Promise<any>;
}

export class ReportingService {
  private convex: ConvexClient;

  constructor(convex: ConvexClient) {
    this.convex = convex;
  }

  /**
   * Generate daily standup report
   */
  async generateDailyStandup(date?: Date): Promise<DailyStandup> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const startTime = startOfDay.getTime();
    const endTime = endOfDay.getTime();

    // Get tasks from the day
    const completedTasks = await this.convex.query('tasks:completedBetween', {
      startTime,
      endTime,
    });

    const inProgressTasks = await this.convex.query('tasks:listByStatus', {
      status: 'in_progress',
    });

    const pendingTasks = await this.convex.query('tasks:listPending', {});

    const failedTasks = await this.convex.query('tasks:failedBetween', {
      startTime,
      endTime,
    });

    // Generate insights
    const insights = this.generateInsights(completedTasks, failedTasks);
    
    // Identify blockers
    const blockers = this.identifyBlockers(failedTasks, inProgressTasks);
    
    // Generate suggestions
    const suggestions = await this.generateSuggestions(
      completedTasks,
      pendingTasks,
      failedTasks
    );

    const standup: DailyStandup = {
      date: targetDate.toISOString().split('T')[0],
      completedTasks: completedTasks.map(this.summarizeTask),
      inProgressTasks: inProgressTasks.map(this.summarizeTask),
      pendingTasks: pendingTasks.slice(0, 10).map(this.summarizeTask), // Top 10 pending
      failedTasks: failedTasks.map(this.summarizeTask),
      insights,
      blockers,
      suggestions,
    };

    // Store standup
    await this.convex.mutation('standups:create', standup);

    logger.info('Daily standup generated', { 
      date: standup.date,
      completed: completedTasks.length,
      inProgress: inProgressTasks.length,
      pending: pendingTasks.length,
    });

    return standup;
  }

  /**
   * Generate performance metrics
   */
  async generatePerformanceMetrics(date?: Date): Promise<PerformanceMetrics> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const startTime = startOfDay.getTime();
    const endTime = endOfDay.getTime();

    // Get all tasks from the day
    const allTasks = await this.convex.query('tasks:createdBetween', {
      startTime,
      endTime,
    });

    const completedTasks = allTasks.filter((t: Task) => t.status === 'completed');
    const failedTasks = allTasks.filter((t: Task) => t.status === 'failed');

    // Calculate average completion time
    const completionTimes = completedTasks
      .filter((t: Task) => t.startedAt && t.completedAt)
      .map((t: Task) => (t.completedAt! - t.startedAt!) / (1000 * 60)); // in minutes

    const averageCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a: number, b: number) => a + b, 0) / completionTimes.length
      : 0;

    // Get agent utilization
    const agents = await this.convex.query('agents:list', {});
    const agentUtilization: Record<string, number> = {};
    
    for (const agent of agents) {
      const agentTasks = await this.convex.query('tasks:byAgent', {
        agentId: agent.id,
        startTime,
        endTime,
      });
      agentUtilization[agent.name] = agentTasks.length;
    }

    // Get top errors
    const topErrors = failedTasks
      .map((t: Task) => t.error)
      .filter(Boolean)
      .slice(0, 5) as string[];

    // Generate improvement areas
    const improvementAreas = this.identifyImprovementAreas(
      completedTasks,
      failedTasks,
      allTasks
    );

    const metrics: PerformanceMetrics = {
      date: targetDate.toISOString().split('T')[0],
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      averageCompletionTime,
      agentUtilization,
      topErrors,
      improvementAreas,
    };

    // Store metrics
    await this.convex.mutation('metrics:create', metrics);

    return metrics;
  }

  /**
   * Generate proactive task suggestions
   */
  async generateTaskSuggestions(): Promise<Array<{
    title: string;
    description: string;
    type: string;
    priority: string;
    rationale: string;
  }>> {
    const suggestions: Array<{
      title: string;
      description: string;
      type: string;
      priority: string;
      rationale: string;
    }> = [];

    // 1. Check for stale issues
    const staleTasks = await this.convex.query('tasks:stale', { 
      olderThanDays: 7 
    });
    
    if (staleTasks.length > 0) {
      suggestions.push({
        title: `Review ${staleTasks.length} stale tasks`,
        description: `There are ${staleTasks.length} tasks that haven't been updated in over 7 days. Consider reviewing, reassigning, or closing them.`,
        type: 'maintenance',
        priority: 'medium',
        rationale: 'Prevent task accumulation and ensure nothing falls through cracks',
      });
    }

    // 2. Check agent workload balance
    const agents = await this.convex.query('agents:list', {});
    const busyAgents = agents.filter((a: any) => a.status === 'busy').length;
    const idleAgents = agents.filter((a: any) => a.status === 'idle').length;
    
    if (idleAgents === 0 && busyAgents > 0) {
      suggestions.push({
        title: 'Scale up agent capacity',
        description: 'All agents are currently busy. Consider registering additional agents to handle the workload.',
        type: 'maintenance',
        priority: 'high',
        rationale: 'Prevent task backlog and ensure timely completion',
      });
    }

    // 3. Check for recurring error patterns
    const recentFailures = await this.convex.query('tasks:recentFailures', { limit: 20 });
    if (recentFailures.length > 5) {
      suggestions.push({
        title: 'Investigate recent task failures',
        description: `There have been ${recentFailures.length} task failures recently. Review error logs and identify root causes.`,
        type: 'bugfix',
        priority: 'high',
        rationale: 'Address systemic issues before they affect more tasks',
      });
    }

    // 4. Look for documentation gaps
    const codeTasks = await this.convex.query('tasks:byType', { type: 'code' });
    const docTasks = await this.convex.query('tasks:byType', { type: 'documentation' });
    
    if (codeTasks.length > docTasks.length * 3) {
      suggestions.push({
        title: 'Improve documentation coverage',
        description: `There are ${codeTasks.length} code tasks but only ${docTasks.length} documentation tasks. Consider adding documentation for recent changes.`,
        type: 'documentation',
        priority: 'low',
        rationale: 'Maintain knowledge base and improve onboarding',
      });
    }

    // 5. Self-improvement suggestion
    const learnings = await this.convex.query('learnings:recent', { limit: 10 });
    if (learnings.length >= 5) {
      suggestions.push({
        title: 'Update SOFIA knowledge base',
        description: `${learnings.length} new learnings have been captured. Consider formalizing these into documentation or updating agent configurations.`,
        type: 'maintenance',
        priority: 'medium',
        rationale: 'Continuously improve based on experience',
      });
    }

    // Store suggestions
    for (const suggestion of suggestions) {
      await this.convex.mutation('suggestions:create', {
        ...suggestion,
        createdAt: Date.now(),
        status: 'pending',
      });
    }

    return suggestions;
  }

  /**
   * Get weekly summary
   */
  async getWeeklySummary(): Promise<{
    period: string;
    totalTasks: number;
    completed: number;
    failed: number;
    averageCompletionTime: number;
    topContributors: string[];
    highlights: string[];
  }> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const tasks = await this.convex.query('tasks:createdBetween', {
      startTime: oneWeekAgo.getTime(),
      endTime: now.getTime(),
    });

    const completed = tasks.filter((t: Task) => t.status === 'completed');
    const failed = tasks.filter((t: Task) => t.status === 'failed');

    // Calculate average completion time
    const times = completed
      .filter((t: Task) => t.startedAt && t.completedAt)
      .map((t: Task) => t.completedAt! - t.startedAt!);
    
    const avgTime = times.length > 0 
      ? times.reduce((a: number, b: number) => a + b, 0) / times.length 
      : 0;

    // Get top contributors (agents)
    const agentTasks: Record<string, number> = {};
    for (const task of completed) {
      if (task.assignedTo) {
        agentTasks[task.assignedTo] = (agentTasks[task.assignedTo] || 0) + 1;
      }
    }

    const sortedAgents = Object.entries(agentTasks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([agentId]) => agentId);

    // Get agent names
    const agentNames: string[] = [];
    for (const agentId of sortedAgents) {
      const agent = await this.convex.query('agents:get', { id: agentId });
      if (agent) agentNames.push(agent.name);
    }

    // Generate highlights
    const highlights: string[] = [];
    if (completed.length > 0) {
      highlights.push(`Completed ${completed.length} tasks`);
    }
    if (failed.length === 0 && tasks.length > 0) {
      highlights.push('Zero failures - perfect week!');
    }
    const criticalTasks = completed.filter((t: Task) => t.priority === 'critical');
    if (criticalTasks.length > 0) {
      highlights.push(`Resolved ${criticalTasks.length} critical issues`);
    }

    return {
      period: `${oneWeekAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
      totalTasks: tasks.length,
      completed: completed.length,
      failed: failed.length,
      averageCompletionTime: avgTime / (1000 * 60 * 60), // hours
      topContributors: agentNames,
      highlights,
    };
  }

  // Private helper methods

  private summarizeTask(task: Task): TaskSummary {
    return {
      id: task.id,
      title: task.title,
      type: task.type,
      assignee: task.assignedTo || 'Unassigned',
      status: task.status,
    };
  }

  private generateInsights(completed: Task[], failed: Task[]): string[] {
    const insights: string[] = [];

    if (completed.length > 0) {
      const types: Record<string, number> = {};
      for (const task of completed) {
        types[task.type] = (types[task.type] || 0) + 1;
      }
      const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
      insights.push(`Most common completed task type: ${topType[0]} (${topType[1]} tasks)`);
    }

    if (failed.length > 0) {
      insights.push(`${failed.length} tasks failed today - consider reviewing error patterns`);
    }

    const completionRate = completed.length + failed.length > 0
      ? (completed.length / (completed.length + failed.length)) * 100
      : 0;
    
    insights.push(`Task completion rate: ${completionRate.toFixed(1)}%`);

    return insights;
  }

  private identifyBlockers(failed: Task[], inProgress: Task[]): string[] {
    const blockers: string[] = [];

    for (const task of failed) {
      if (task.error && task.error.includes('timeout')) {
        blockers.push(`Timeout issues affecting ${task.type} tasks`);
      }
      if (task.error && task.error.includes('permission')) {
        blockers.push(`Permission issues detected - check API keys`);
      }
    }

    // Remove duplicates
    return [...new Set(blockers)];
  }

  private async generateSuggestions(
    completed: Task[],
    pending: Task[],
    failed: Task[]
  ): Promise<string[]> {
    const suggestions: string[] = [];

    if (pending.length > 10) {
      suggestions.push('High number of pending tasks - consider prioritizing or adding more agents');
    }

    if (failed.length > completed.length / 3) {
      suggestions.push('High failure rate detected - review recent changes and error logs');
    }

    // Check for long-running tasks
    const longRunning = pending.filter(t => 
      t.startedAt && Date.now() - t.startedAt > 2 * 60 * 60 * 1000 // 2 hours
    );
    if (longRunning.length > 0) {
      suggestions.push(`${longRunning.length} tasks have been running for over 2 hours - consider checking their status`);
    }

    return suggestions;
  }

  private identifyImprovementAreas(
    completed: Task[],
    failed: Task[],
    all: Task[]
  ): string[] {
    const areas: string[] = [];

    if (failed.length > 0) {
      const errorTypes = new Set(failed.map(t => t.error?.split(':')[0]).filter(Boolean));
      if (errorTypes.size > 0) {
        areas.push(`Address ${errorTypes.size} types of recurring errors`);
      }
    }

    const completionRate = all.length > 0 ? (completed.length / all.length) * 100 : 0;
    if (completionRate < 80) {
      areas.push('Improve task completion rate (currently below 80%)');
    }

    return areas;
  }
}