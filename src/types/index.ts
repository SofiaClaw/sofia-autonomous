/**
 * Core type definitions for SOFIA Autonomous System
 */

// Task Types
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType = 'code' | 'bugfix' | 'review' | 'deploy' | 'research' | 'documentation' | 'test' | 'maintenance';

export interface Task {
  _id?: string;
  _creationTime?: number;
  
  // Core fields
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  
  // Assignment
  assignedTo?: string; // agent ID
  createdBy: string; // 'sofia', 'user', 'system', 'github'
  
  // Context
  repository?: string;
  branch?: string;
  filePaths?: string[];
  relatedIssues?: number[];
  
  // Progress tracking
  progress: number; // 0-100
  startedAt?: number;
  completedAt?: number;
  estimatedHours?: number;
  actualHours?: number;
  
  // Results
  result?: TaskResult;
  error?: string;
  
  // Metadata
  tags: string[];
  createdAt: number;
  updatedAt: number;
  
  // Sub-agent specific
  subAgentConfig?: SubAgentConfig;
}

export interface TaskResult {
  success: boolean;
  output?: string;
  filesChanged?: string[];
  prUrl?: string;
  commitSha?: string;
  summary: string;
  learnings?: string[];
}

export interface SubAgentConfig {
  model?: string;
  thinking?: 'low' | 'medium' | 'high';
  timeout?: number;
  maxRetries?: number;
  tools?: string[];
}

// Agent Types
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';
export type AgentCapability = 'code' | 'bugfix' | 'review' | 'deploy' | 'research' | 'documentation' | 'test' | 'maintenance' | 'fullstack';

export interface Agent {
  _id?: string;
  _creationTime?: number;
  
  id: string;
  name: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  
  // Current work
  currentTaskId?: string;
  currentSessionId?: string;
  
  // Stats
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageTaskDuration: number; // minutes
  successRate: number; // 0-100
  
  // Performance
  lastActiveAt: number;
  createdAt: number;
  
  // Configuration
  config: AgentConfig;
}

export interface AgentConfig {
  maxConcurrentTasks: number;
  preferredTaskTypes: TaskType[];
  autoAcceptTasks: boolean;
  workingHours?: {
    start: string; // "09:00"
    end: string; // "17:00"
    timezone: string;
  };
}

// Session Types (OpenClaw integration)
export interface AgentSession {
  _id?: string;
  _creationTime?: number;
  
  id: string;
  agentId: string;
  taskId: string;
  
  // OpenClaw session reference
  openclawSessionId?: string;
  
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  
  // Logs
  logs: SessionLog[];
  
  // Timing
  startedAt: number;
  endedAt?: number;
  
  // Output
  output?: string;
  error?: string;
}

export interface SessionLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

// GitHub Integration Types
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  author: string;
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  branch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  url: string;
}

// Mission Control Types
export interface MissionControlEvent {
  id: string;
  type: 'task_created' | 'task_updated' | 'agent_spawned' | 'deployment_requested';
  payload: Record<string, any>;
  timestamp: number;
}

// Standup/Reporting Types
export interface DailyStandup {
  date: string;
  completedTasks: TaskSummary[];
  inProgressTasks: TaskSummary[];
  pendingTasks: TaskSummary[];
  failedTasks: TaskSummary[];
  insights: string[];
  blockers: string[];
  suggestions: string[];
}

export interface TaskSummary {
  id: string;
  title: string;
  type: TaskType;
  assignee: string;
  status: TaskStatus;
}

// Performance Metrics
export interface PerformanceMetrics {
  date: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageCompletionTime: number;
  agentUtilization: Record<string, number>;
  topErrors: string[];
  improvementAreas: string[];
}

// Admin API Types
export interface AdminStats {
  agents: {
    total: number;
    online: number;
    busy: number;
    idle: number;
  };
  tasks: {
    total: number;
    pending: number;
    inProgress: number;
    completedToday: number;
    failedToday: number;
  };
  sessions: {
    active: number;
    completedToday: number;
  };
  system: {
    uptime: number;
    version: string;
    lastDeployment: number;
  };
}

export interface DeploymentTrigger {
  id: string;
  environment: 'staging' | 'production';
  triggeredBy: string;
  commitSha: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  logs: string[];
}