/**
 * Utility functions for SOFIA Autonomous System
 */

import { createHash, randomBytes } from 'crypto';
import { Task, TaskType, AgentCapability, Agent } from '../types';

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${prefix}${prefix ? '_' : ''}${timestamp}_${random}`;
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}

/**
 * Hash a string for secure comparison
 */
export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Securely compare two strings (timing-safe)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Map task type to required agent capabilities
 */
export function getRequiredCapabilities(taskType: TaskType): AgentCapability[] {
  const mapping: Record<TaskType, AgentCapability[]> = {
    code: ['code', 'fullstack'],
    bugfix: ['bugfix', 'code', 'fullstack'],
    review: ['review', 'code'],
    deploy: ['deploy'],
    research: ['research'],
    documentation: ['documentation'],
    test: ['test', 'code'],
    maintenance: ['maintenance', 'code'],
  };
  return mapping[taskType] || ['code'];
}

/**
 * Check if an agent can handle a task type
 */
export function canAgentHandleTask(agent: Agent, taskType: TaskType): boolean {
  const requiredCapabilities = getRequiredCapabilities(taskType);
  return requiredCapabilities.some(cap => agent.capabilities.includes(cap));
}

/**
 * Calculate priority score for task assignment
 * Higher score = higher priority
 */
export function calculatePriorityScore(task: Task): number {
  const priorityWeights = {
    critical: 100,
    high: 50,
    medium: 25,
    low: 10,
  };
  
  const ageWeight = Math.min((Date.now() - task.createdAt) / (1000 * 60 * 60), 24); // Max 24 hours
  
  return (priorityWeights[task.priority] || 0) + ageWeight;
}

/**
 * Find the best agent for a task
 */
export function findBestAgent(agents: Agent[], task: Task): Agent | null {
  const availableAgents = agents.filter(
    agent => agent.status === 'idle' && canAgentHandleTask(agent, task.type)
  );
  
  if (availableAgents.length === 0) return null;
  
  // Sort by success rate and total tasks completed
  return availableAgents.sort((a, b) => {
    const scoreA = a.successRate * 0.6 + (a.totalTasksCompleted / 100) * 0.4;
    const scoreB = b.successRate * 0.6 + (b.totalTasksCompleted / 100) * 0.4;
    return scoreB - scoreA;
  })[0];
}

/**
 * Format duration from milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Parse GitHub issue body for task details
 */
export function parseIssueBody(body: string): {
  description: string;
  type?: TaskType;
  priority?: string;
  labels: string[];
} {
  const labels: string[] = [];
  let type: TaskType | undefined;
  let priority: string | undefined;
  
  // Extract labels from checkboxes
  const checkboxRegex = /- \[x\] (\w+)/gi;
  let match;
  while ((match = checkboxRegex.exec(body)) !== null) {
    labels.push(match[1].toLowerCase());
  }
  
  // Try to determine task type from labels
  const typeLabels = ['bug', 'feature', 'docs', 'test', 'refactor', 'deploy'];
  for (const label of labels) {
    if (label.includes('bug')) type = 'bugfix';
    else if (label.includes('feature')) type = 'code';
    else if (label.includes('doc')) type = 'documentation';
    else if (label.includes('test')) type = 'test';
    else if (label.includes('deploy')) type = 'deploy';
    else if (label.includes('refactor')) type = 'maintenance';
  }
  
  // Try to determine priority
  if (body.includes('critical') || body.includes('urgent')) priority = 'critical';
  else if (body.includes('high priority')) priority = 'high';
  else if (body.includes('low priority')) priority = 'low';
  
  return {
    description: body.replace(/- \[[ x]\].*\n/g, '').trim(),
    type,
    priority,
    labels,
  };
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

/**
 * Validate task data
 */
export function validateTask(data: Partial<Task>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.title || data.title.length < 3) {
    errors.push('Title must be at least 3 characters');
  }
  
  if (!data.description || data.description.length < 10) {
    errors.push('Description must be at least 10 characters');
  }
  
  if (!data.type) {
    errors.push('Task type is required');
  }
  
  if (!data.priority) {
    errors.push('Priority is required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}