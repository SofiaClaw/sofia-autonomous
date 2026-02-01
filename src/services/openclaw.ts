/**
 * OpenClaw Gateway Integration Service
 * Handles spawning sub-agents and session management
 */

import axios from 'axios';
import { AgentSession, SessionLog, Task, SubAgentConfig } from '../types';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

interface OpenClawSession {
  id: string;
  status: string;
  created_at: string;
}

interface SpawnAgentRequest {
  task: string;
  model?: string;
  thinking?: 'low' | 'medium' | 'high';
  timeout?: number;
  tools?: string[];
  workdir?: string;
}

export class OpenClawService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3001';
    this.apiKey = process.env.OPENCLAW_API_KEY || '';
  }

  /**
   * Spawn a new sub-agent session for a task
   */
  async spawnAgent(
    task: Task,
    config?: SubAgentConfig
  ): Promise<{ sessionId: string; openclawSessionId: string }> {
    try {
      const request: SpawnAgentRequest = {
        task: this.formatTaskForAgent(task),
        model: config?.model || 'kimi-code/kimi-for-coding',
        thinking: config?.thinking || 'medium',
        timeout: config?.timeout || 600, // 10 minutes default
        tools: config?.tools || ['read', 'write', 'edit', 'exec', 'web_search', 'web_fetch'],
        workdir: process.env.WORKSPACE_DIR || '/home/ubuntu/.openclaw/workspace',
      };

      logger.info('Spawning sub-agent', { 
        taskId: task.id, 
        taskType: task.type,
        model: request.model,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/sessions/spawn`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout for spawn request
        }
      );

      const openclawSessionId = response.data.sessionId || response.data.id;
      const sessionId = generateId('session');

      logger.info('Sub-agent spawned successfully', { 
        taskId: task.id,
        sessionId,
        openclawSessionId,
      });

      return {
        sessionId,
        openclawSessionId,
      };
    } catch (error) {
      logger.error('Failed to spawn sub-agent', { 
        error, 
        taskId: task.id,
        baseUrl: this.baseUrl,
      });
      throw error;
    }
  }

  /**
   * Get session status from OpenClaw
   */
  async getSessionStatus(openclawSessionId: string): Promise<{
    status: string;
    output?: string;
    error?: string;
    completedAt?: string;
  }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/sessions/${openclawSessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      return {
        status: response.data.status,
        output: response.data.output,
        error: response.data.error,
        completedAt: response.data.completedAt,
      };
    } catch (error) {
      logger.error('Failed to get session status', { error, openclawSessionId });
      throw error;
    }
  }

  /**
   * Stream session logs
   */
  async streamSessionLogs(
    openclawSessionId: string,
    onLog: (log: SessionLog) => void
  ): Promise<void> {
    try {
      // Note: This would use WebSocket in production
      // For now, we poll for updates
      const pollInterval = setInterval(async () => {
        try {
          const status = await this.getSessionStatus(openclawSessionId);
          
          onLog({
            timestamp: Date.now(),
            level: status.error ? 'error' : 'info',
            message: status.output || status.error || 'Processing...',
            metadata: { status: status.status },
          });

          if (status.status === 'completed' || status.status === 'failed' || status.status === 'error') {
            clearInterval(pollInterval);
          }
        } catch (error) {
          onLog({
            timestamp: Date.now(),
            level: 'error',
            message: `Failed to poll session: ${error}`,
          });
          clearInterval(pollInterval);
        }
      }, 5000); // Poll every 5 seconds

    } catch (error) {
      logger.error('Failed to stream session logs', { error, openclawSessionId });
      throw error;
    }
  }

  /**
   * Cancel a running session
   */
  async cancelSession(openclawSessionId: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/api/sessions/${openclawSessionId}/cancel`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      logger.info('Session cancelled', { openclawSessionId });
    } catch (error) {
      logger.error('Failed to cancel session', { error, openclawSessionId });
      throw error;
    }
  }

  /**
   * List active sessions
   */
  async listSessions(): Promise<OpenClawSession[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/sessions`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.sessions || [];
    } catch (error) {
      logger.error('Failed to list sessions', { error });
      throw error;
    }
  }

  /**
   * Check if OpenClaw gateway is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/health`,
        { timeout: 5000 }
      );

      return {
        healthy: response.status === 200,
        version: response.data.version,
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Format task description for sub-agent
   */
  private formatTaskForAgent(task: Task): string {
    const sections = [
      `# Task: ${task.title}`,
      ``,
      `## Description`,
      task.description,
      ``,
      `## Requirements`,
      `- Task ID: ${task.id}`,
      `- Type: ${task.type}`,
      `- Priority: ${task.priority}`,
    ];

    if (task.repository) {
      sections.push(`- Repository: ${task.repository}`);
    }

    if (task.branch) {
      sections.push(`- Branch: ${task.branch}`);
    }

    if (task.filePaths && task.filePaths.length > 0) {
      sections.push(`- Related Files: ${task.filePaths.join(', ')}`);
    }

    if (task.relatedIssues && task.relatedIssues.length > 0) {
      sections.push(`- Related Issues: #${task.relatedIssues.join(', #')}`);
    }

    sections.push('');
    sections.push('## Instructions');
    sections.push('1. Read the relevant files to understand the codebase');
    sections.push('2. Implement the required changes');
    sections.push('3. Test your changes if possible');
    sections.push('4. Commit with a descriptive message');
    sections.push('5. Report your findings and actions taken');

    return sections.join('\n');
  }

  /**
   * Spawn a specialized agent for specific task types
   */
  async spawnSpecializedAgent(
    task: Task,
    specialization: 'code' | 'bugfix' | 'review' | 'deploy' | 'documentation'
  ): Promise<{ sessionId: string; openclawSessionId: string }> {
    const specializedConfigs: Record<string, SubAgentConfig> = {
      code: {
        model: 'kimi-code/kimi-for-coding',
        thinking: 'high',
        timeout: 900,
        tools: ['read', 'write', 'edit', 'exec', 'web_search'],
      },
      bugfix: {
        model: 'kimi-code/kimi-for-coding',
        thinking: 'high',
        timeout: 600,
        tools: ['read', 'write', 'edit', 'exec', 'web_search'],
      },
      review: {
        model: 'kimi-code/kimi-for-coding',
        thinking: 'medium',
        timeout: 300,
        tools: ['read', 'web_search'],
      },
      deploy: {
        model: 'kimi-code/kimi-for-coding',
        thinking: 'low',
        timeout: 300,
        tools: ['read', 'exec', 'web_search'],
      },
      documentation: {
        model: 'kimi-code/kimi-for-coding',
        thinking: 'medium',
        timeout: 400,
        tools: ['read', 'write', 'edit', 'web_search'],
      },
    };

    const config = specializedConfigs[specialization] || specializedConfigs.code;
    
    // Merge with task-specific config
    const mergedConfig: SubAgentConfig = {
      ...config,
      ...task.subAgentConfig,
    };

    return this.spawnAgent(task, mergedConfig);
  }
}