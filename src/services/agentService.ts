/**
 * Agent Management Service
 * Handles agent lifecycle, registration, and capabilities
 */

import { Agent, AgentStatus, AgentCapability, AgentConfig, AgentSession } from '../types';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

interface ConvexClient {
  mutation: (name: string, args: any) => Promise<any>;
  query: (name: string, args: any) => Promise<any>;
}

export class AgentService {
  private convex: ConvexClient;

  constructor(convex: ConvexClient) {
    this.convex = convex;
  }

  /**
   * Register a new agent
   */
  async registerAgent(
    name: string,
    capabilities: AgentCapability[],
    config?: Partial<AgentConfig>
  ): Promise<Agent> {
    const agentId = generateId('agent');

    const agent: Agent = {
      id: agentId,
      name,
      status: 'idle',
      capabilities,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      averageTaskDuration: 0,
      successRate: 100,
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
      config: {
        maxConcurrentTasks: 1,
        autoAcceptTasks: true,
        preferredTaskTypes: [],
        ...config,
      },
    };

    await this.convex.mutation('agents:create', agent);

    logger.info('Agent registered', { 
      agentId, 
      name, 
      capabilities: capabilities.join(', ') 
    });

    return agent;
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    return this.convex.query('agents:get', { id: agentId });
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<Agent[]> {
    return this.convex.query('agents:list', {});
  }

  /**
   * List available (idle) agents
   */
  async listAvailableAgents(): Promise<Agent[]> {
    return this.convex.query('agents:listAvailable', {});
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(
    agentId: string, 
    status: AgentStatus,
    metadata?: { currentTaskId?: string; currentSessionId?: string }
  ): Promise<void> {
    const updates: Partial<Agent> = {
      status,
      lastActiveAt: Date.now(),
    };

    if (metadata?.currentTaskId !== undefined) {
      updates.currentTaskId = metadata.currentTaskId;
    }

    if (metadata?.currentSessionId !== undefined) {
      updates.currentSessionId = metadata.currentSessionId;
    }

    await this.convex.mutation('agents:update', { id: agentId, ...updates });

    logger.debug('Agent status updated', { agentId, status });
  }

  /**
   * Update agent stats after task completion
   */
  async updateAgentStats(
    agentId: string,
    taskDuration: number,
    success: boolean
  ): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) return;

    const totalTasks = agent.totalTasksCompleted + agent.totalTasksFailed + 1;
    const newSuccessRate = success
      ? ((agent.totalTasksCompleted + 1) / totalTasks) * 100
      : (agent.totalTasksCompleted / totalTasks) * 100;

    // Calculate new average duration
    const totalDuration = agent.averageTaskDuration * (totalTasks - 1) + taskDuration;
    const newAverageDuration = totalDuration / totalTasks;

    await this.convex.mutation('agents:update', {
      id: agentId,
      totalTasksCompleted: success ? agent.totalTasksCompleted + 1 : agent.totalTasksCompleted,
      totalTasksFailed: success ? agent.totalTasksFailed : agent.totalTasksFailed + 1,
      averageTaskDuration: newAverageDuration,
      successRate: newSuccessRate,
      lastActiveAt: Date.now(),
    });
  }

  /**
   * Heartbeat from agent
   */
  async agentHeartbeat(agentId: string): Promise<void> {
    await this.convex.mutation('agents:update', {
      id: agentId,
      lastActiveAt: Date.now(),
    });
  }

  /**
   * Mark inactive agents as offline
   */
  async checkAgentHealth(): Promise<void> {
    const agents = await this.listAgents();
    const now = Date.now();
    const threshold = 5 * 60 * 1000; // 5 minutes

    for (const agent of agents) {
      if (agent.status === 'offline') continue;
      
      const lastActive = agent.lastActiveAt || agent.createdAt;
      if (now - lastActive > threshold) {
        await this.updateAgentStatus(agent.id, 'offline');
        
        // If agent was working on a task, reassign it
        if (agent.currentTaskId) {
          await this.handleAgentDisconnect(agent);
        }

        logger.warn('Agent marked offline due to inactivity', { 
          agentId: agent.id, 
          lastActive: new Date(lastActive).toISOString() 
        });
      }
    }
  }

  /**
   * Handle agent disconnection
   */
  private async handleAgentDisconnect(agent: Agent): Promise<void> {
    if (!agent.currentTaskId) return;

    // Get the task
    const task = await this.convex.query('tasks:get', { id: agent.currentTaskId });
    if (!task) return;

    // If task is in progress, reset it to pending
    if (task.status === 'in_progress' || task.status === 'assigned') {
      await this.convex.mutation('tasks:update', {
        id: task.id,
        status: 'pending',
        assignedTo: undefined,
        progress: 0,
        updatedAt: Date.now(),
      });

      logger.info('Task reset to pending due to agent disconnect', { 
        taskId: task.id, 
        agentId: agent.id 
      });
    }
  }

  /**
   * Deregister an agent
   */
  async deregisterAgent(agentId: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Handle any active tasks
    if (agent.currentTaskId) {
      await this.handleAgentDisconnect(agent);
    }

    await this.convex.mutation('agents:delete', { id: agentId });

    logger.info('Agent deregistered', { agentId, name: agent.name });
  }

  /**
   * Get agent performance metrics
   */
  async getAgentMetrics(agentId: string): Promise<{
    totalTasks: number;
    successRate: number;
    averageTaskDuration: number;
    tasksByType: Record<string, number>;
    recentSessions: AgentSession[];
  } | null> {
    const agent = await this.getAgent(agentId);
    if (!agent) return null;

    // Get recent sessions
    const sessions = await this.convex.query('sessions:listByAgent', { 
      agentId,
      limit: 10 
    });

    // Get task breakdown by type
    const tasksByType = await this.convex.query('tasks:countByType', { agentId });

    return {
      totalTasks: agent.totalTasksCompleted + agent.totalTasksFailed,
      successRate: agent.successRate,
      averageTaskDuration: agent.averageTaskDuration,
      tasksByType,
      recentSessions: sessions,
    };
  }

  /**
   * Get system-wide agent stats
   */
  async getSystemStats(): Promise<{
    total: number;
    online: number;
    busy: number;
    idle: number;
    offline: number;
    error: number;
  }> {
    const agents = await this.listAgents();

    return {
      total: agents.length,
      online: agents.filter(a => a.status !== 'offline').length,
      busy: agents.filter(a => a.status === 'busy').length,
      idle: agents.filter(a => a.status === 'idle').length,
      offline: agents.filter(a => a.status === 'offline').length,
      error: agents.filter(a => a.status === 'error').length,
    };
  }

  /**
   * Initialize default agents
   */
  async initializeDefaultAgents(): Promise<void> {
    const existing = await this.listAgents();
    if (existing.length > 0) {
      logger.info('Agents already initialized', { count: existing.length });
      return;
    }

    // Create default SOFIA agent
    await this.registerAgent(
      'SOFIA-Master',
      ['fullstack', 'code', 'bugfix', 'review', 'deploy', 'documentation', 'research'],
      {
        maxConcurrentTasks: 3,
        autoAcceptTasks: true,
      }
    );

    // Create specialized agents
    await this.registerAgent(
      'Code-Expert',
      ['code', 'bugfix', 'fullstack'],
      {
        maxConcurrentTasks: 2,
        autoAcceptTasks: true,
        preferredTaskTypes: ['code', 'bugfix'],
      }
    );

    await this.registerAgent(
      'Review-Guardian',
      ['review', 'documentation'],
      {
        maxConcurrentTasks: 5,
        autoAcceptTasks: true,
        preferredTaskTypes: ['review', 'documentation'],
      }
    );

    await this.registerAgent(
      'Deploy-Engineer',
      ['deploy', 'maintenance'],
      {
        maxConcurrentTasks: 1,
        autoAcceptTasks: true,
        preferredTaskTypes: ['deploy', 'maintenance'],
      }
    );

    logger.info('Default agents initialized');
  }
}