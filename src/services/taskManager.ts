/**
 * Task Management Service
 * Handles task lifecycle, assignment, and orchestration
 */

import { Task, TaskStatus, Agent, AgentSession, TaskResult, TaskType } from '../types';
import { GitHubService } from './github';
import { OpenClawService } from './openclaw';
import { logger } from '../utils/logger';
import { 
  generateId, 
  validateTask, 
  calculatePriorityScore, 
  findBestAgent,
  parseIssueBody 
} from '../utils/helpers';
import { createAgentLogger, createTaskLogger } from '../utils/logger';

// Convex client placeholder - will be properly initialized
interface ConvexClient {
  mutation: (name: string, args: any) => Promise<any>;
  query: (name: string, args: any) => Promise<any>;
  action: (name: string, args: any) => Promise<any>;
}

export class TaskManager {
  private convex: ConvexClient;
  private github: GitHubService;
  private openclaw: OpenClawService;
  private activeSessions: Map<string, AgentSession> = new Map();

  constructor(convex: ConvexClient) {
    this.convex = convex;
    this.github = new GitHubService();
    this.openclaw = new OpenClawService();
  }

  /**
   * Create a new task
   */
  async createTask(
    title: string,
    description: string,
    type: TaskType,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    options: {
      createdBy?: string;
      repository?: string;
      branch?: string;
      filePaths?: string[];
      relatedIssues?: number[];
      tags?: string[];
      estimatedHours?: number;
      autoAssign?: boolean;
    } = {}
  ): Promise<Task> {
    const taskId = generateId('task');
    
    const task: Task = {
      id: taskId,
      title,
      description,
      type,
      status: 'pending',
      priority,
      createdBy: options.createdBy || 'sofia',
      repository: options.repository,
      branch: options.branch,
      filePaths: options.filePaths,
      relatedIssues: options.relatedIssues,
      tags: options.tags || [],
      progress: 0,
      estimatedHours: options.estimatedHours,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Validate task
    const validation = validateTask(task);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    // Store in Convex
    await this.convex.mutation('tasks:create', task);

    logger.info('Task created', { 
      taskId, 
      type, 
      priority,
      title: truncate(title, 50),
    });

    // Auto-assign if requested
    if (options.autoAssign) {
      await this.assignTask(taskId);
    }

    return task;
  }

  /**
   * Create task from GitHub issue
   */
  async createTaskFromIssue(issueNumber: number): Promise<Task> {
    try {
      const issue = await this.github.getIssue(issueNumber);
      const parsed = parseIssueBody(issue.body);

      // Determine task type from labels
      let taskType: TaskType = 'code';
      if (issue.labels.includes('bug')) taskType = 'bugfix';
      else if (issue.labels.includes('documentation')) taskType = 'documentation';
      else if (issue.labels.includes('test')) taskType = 'test';
      else if (issue.labels.includes('deploy')) taskType = 'deploy';

      // Determine priority
      let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (issue.labels.includes('critical')) priority = 'critical';
      else if (issue.labels.includes('high-priority')) priority = 'high';
      else if (issue.labels.includes('low-priority')) priority = 'low';

      return this.createTask(
        issue.title,
        parsed.description || issue.body,
        parsed.type || taskType,
        (parsed.priority as any) || priority,
        {
          createdBy: 'github',
          tags: issue.labels,
          autoAssign: true,
        }
      );
    } catch (error) {
      logger.error('Failed to create task from issue', { error, issueNumber });
      throw error;
    }
  }

  /**
   * Assign task to best available agent
   */
  async assignTask(taskId: string, agentId?: string): Promise<Task | null> {
    try {
      // Get task
      const task = await this.convex.query('tasks:get', { id: taskId });
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (task.status !== 'pending') {
        logger.warn('Task already assigned or processed', { taskId, status: task.status });
        return task;
      }

      // Get available agents
      const agents = await this.convex.query('agents:listAvailable', {});

      let selectedAgent: Agent | null = null;

      if (agentId) {
        // Specific agent requested
        selectedAgent = agents.find((a: Agent) => a.id === agentId) || null;
      } else {
        // Find best agent
        selectedAgent = findBestAgent(agents, task);
      }

      if (!selectedAgent) {
        logger.warn('No available agent for task', { 
          taskId, 
          taskType: task.type,
          availableAgents: agents.length,
        });
        return task;
      }

      // Update task
      const updates: Partial<Task> = {
        assignedTo: selectedAgent.id,
        status: 'assigned',
        updatedAt: Date.now(),
      };

      await this.convex.mutation('tasks:update', { id: taskId, ...updates });

      // Update agent status
      await this.convex.mutation('agents:update', {
        id: selectedAgent.id,
        status: 'busy',
        currentTaskId: taskId,
      });

      logger.info('Task assigned', { 
        taskId, 
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
      });

      // Auto-start the task
      await this.startTask(taskId);

      return { ...task, ...updates };
    } catch (error) {
      logger.error('Failed to assign task', { error, taskId, agentId });
      throw error;
    }
  }

  /**
   * Start executing a task
   */
  async startTask(taskId: string): Promise<void> {
    try {
      const task = await this.convex.query('tasks:get', { id: taskId });
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (!task.assignedTo) {
        throw new Error(`Task not assigned: ${taskId}`);
      }

      // Update task status
      await this.convex.mutation('tasks:update', {
        id: taskId,
        status: 'in_progress',
        startedAt: Date.now(),
        progress: 10,
        updatedAt: Date.now(),
      });

      // Get agent
      const agent = await this.convex.query('agents:get', { id: task.assignedTo });

      // Spawn sub-agent
      const { sessionId, openclawSessionId } = await this.openclaw.spawnSpecializedAgent(
        task,
        task.type as any
      );

      // Create session record
      const session: AgentSession = {
        id: sessionId,
        agentId: agent.id,
        taskId,
        openclawSessionId,
        status: 'running',
        logs: [{
          timestamp: Date.now(),
          level: 'info',
          message: `Task started by agent ${agent.name}`,
        }],
        startedAt: Date.now(),
      };

      await this.convex.mutation('sessions:create', session);
      this.activeSessions.set(sessionId, session);

      // Monitor session
      this.monitorSession(sessionId, openclawSessionId, taskId);

      logger.info('Task started', { 
        taskId, 
        agentId: agent.id,
        sessionId,
        openclawSessionId,
      });
    } catch (error) {
      logger.error('Failed to start task', { error, taskId });
      
      // Mark task as failed
      await this.convex.mutation('tasks:update', {
        id: taskId,
        status: 'failed',
        error: (error as Error).message,
        updatedAt: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Monitor a running session
   */
  private async monitorSession(
    sessionId: string,
    openclawSessionId: string,
    taskId: string
  ): Promise<void> {
    const checkInterval = setInterval(async () => {
      try {
        const status = await this.openclaw.getSessionStatus(openclawSessionId);
        
        // Update session logs
        await this.convex.mutation('sessions:appendLog', {
          id: sessionId,
          log: {
            timestamp: Date.now(),
            level: status.error ? 'error' : 'info',
            message: status.output || status.error || 'Processing...',
            metadata: { status: status.status },
          },
        });

        // Update task progress
        if (status.status === 'running') {
          await this.convex.mutation('tasks:update', {
            id: taskId,
            progress: Math.min(90, await this.getTaskProgress(taskId) + 10),
            updatedAt: Date.now(),
          });
        }

        // Handle completion
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'error') {
          clearInterval(checkInterval);
          await this.completeTask(taskId, sessionId, {
            success: status.status === 'completed',
            output: status.output,
            error: status.error,
          });
        }
      } catch (error) {
        logger.error('Session monitoring error', { error, sessionId, taskId });
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Complete a task
   */
  private async completeTask(
    taskId: string,
    sessionId: string,
    result: { success: boolean; output?: string; error?: string }
  ): Promise<void> {
    try {
      const task = await this.convex.query('tasks:get', { id: taskId });
      const session = await this.convex.query('sessions:get', { id: sessionId });

      const taskResult: TaskResult = {
        success: result.success,
        output: result.output,
        summary: result.success 
          ? `Task completed successfully` 
          : `Task failed: ${result.error}`,
      };

      // Update task
      await this.convex.mutation('tasks:update', {
        id: taskId,
        status: result.success ? 'completed' : 'failed',
        progress: result.success ? 100 : task.progress,
        result: taskResult,
        error: result.error,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Update session
      await this.convex.mutation('sessions:update', {
        id: sessionId,
        status: result.success ? 'completed' : 'failed',
        endedAt: Date.now(),
        output: result.output,
        error: result.error,
      });

      // Free up agent
      if (task.assignedTo) {
        await this.convex.mutation('agents:update', {
          id: task.assignedTo,
          status: 'idle',
          currentTaskId: undefined,
          // Update stats
          $increment: {
            totalTasksCompleted: result.success ? 1 : 0,
            totalTasksFailed: result.success ? 0 : 1,
          },
        });
      }

      // Extract learnings from successful tasks
      if (result.success && result.output) {
        await this.extractLearnings(task, result.output);
      }

      logger.info('Task completed', { 
        taskId, 
        success: result.success,
        agentId: task.assignedTo,
      });

      // Process next pending task
      await this.processNextTask();
    } catch (error) {
      logger.error('Failed to complete task', { error, taskId });
    }
  }

  /**
   * Extract learnings from completed task
   */
  private async extractLearnings(task: Task, output: string): Promise<void> {
    // Simple extraction - in production, use LLM
    const learnings: string[] = [];
    
    // Look for patterns like "Lesson learned", "Note:", etc.
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes('lesson') || 
          line.toLowerCase().includes('note:') ||
          line.toLowerCase().includes('learning:')) {
        learnings.push(line.trim());
      }
    }

    if (learnings.length > 0) {
      await this.convex.mutation('learnings:create', {
        taskId: task.id,
        taskType: task.type,
        learnings,
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Process next pending task
   */
  async processNextTask(): Promise<void> {
    try {
      // Get pending tasks sorted by priority
      const pendingTasks = await this.convex.query('tasks:listPending', {});
      
      if (pendingTasks.length === 0) return;

      // Get available agents
      const availableAgents = await this.convex.query('agents:listAvailable', {});
      
      if (availableAgents.length === 0) return;

      // Try to assign highest priority task
      const sortedTasks = pendingTasks.sort((a: Task, b: Task) => 
        calculatePriorityScore(b) - calculatePriorityScore(a)
      );

      for (const task of sortedTasks) {
        const bestAgent = findBestAgent(availableAgents, task);
        if (bestAgent) {
          await this.assignTask(task.id, bestAgent.id);
          break; // Only assign one at a time
        }
      }
    } catch (error) {
      logger.error('Failed to process next task', { error });
    }
  }

  /**
   * Get task progress (placeholder)
   */
  private async getTaskProgress(taskId: string): Promise<number> {
    const task = await this.convex.query('tasks:get', { id: taskId });
    return task?.progress || 0;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    try {
      const task = await this.convex.query('tasks:get', { id: taskId });
      
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Cancel running session if exists
      if (task.assignedTo) {
        const session = await this.convex.query('sessions:getByTask', { taskId });
        if (session && session.openclawSessionId) {
          await this.openclaw.cancelSession(session.openclawSessionId);
        }
      }

      // Update task
      await this.convex.mutation('tasks:update', {
        id: taskId,
        status: 'cancelled',
        error: reason || 'Cancelled by system',
        updatedAt: Date.now(),
      });

      // Free up agent
      if (task.assignedTo) {
        await this.convex.mutation('agents:update', {
          id: task.assignedTo,
          status: 'idle',
          currentTaskId: undefined,
        });
      }

      logger.info('Task cancelled', { taskId, reason });
    } catch (error) {
      logger.error('Failed to cancel task', { error, taskId });
      throw error;
    }
  }

  /**
   * Get all active tasks
   */
  async getActiveTasks(): Promise<Task[]> {
    return this.convex.query('tasks:listActive', {});
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.convex.query('tasks:listByStatus', { status });
  }
}

// Helper function
function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}