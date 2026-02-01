/**
 * Convex Schema Definition
 * Defines the database schema for SOFIA Autonomous
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tasks table
  tasks: defineTable({
    id: v.string(),
    title: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("code"),
      v.literal("bugfix"),
      v.literal("review"),
      v.literal("deploy"),
      v.literal("research"),
      v.literal("documentation"),
      v.literal("test"),
      v.literal("maintenance")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    assignedTo: v.optional(v.string()),
    createdBy: v.string(),
    repository: v.optional(v.string()),
    branch: v.optional(v.string()),
    filePaths: v.optional(v.array(v.string())),
    relatedIssues: v.optional(v.array(v.number())),
    progress: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    estimatedHours: v.optional(v.number()),
    actualHours: v.optional(v.number()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    subAgentConfig: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_assigned", ["assignedTo"])
    .index("by_type", ["type"])
    .index("by_created", ["createdAt"])
    .index("by_priority", ["priority"]),

  // Agents table
  agents: defineTable({
    id: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("busy"),
      v.literal("offline"),
      v.literal("error")
    ),
    capabilities: v.array(v.string()),
    currentTaskId: v.optional(v.string()),
    currentSessionId: v.optional(v.string()),
    totalTasksCompleted: v.number(),
    totalTasksFailed: v.number(),
    averageTaskDuration: v.number(),
    successRate: v.number(),
    lastActiveAt: v.number(),
    createdAt: v.number(),
    config: v.any(),
  })
    .index("by_status", ["status"]),

  // Sessions table
  sessions: defineTable({
    id: v.string(),
    agentId: v.string(),
    taskId: v.string(),
    openclawSessionId: v.optional(v.string()),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    logs: v.array(v.any()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_status", ["status"]),

  // Deployments table
  deployments: defineTable({
    id: v.string(),
    environment: v.union(v.literal("staging"), v.literal("production")),
    commitSha: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    triggeredBy: v.string(),
    taskId: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    logs: v.array(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_environment", ["environment"]),

  // Daily standups table
  standups: defineTable({
    date: v.string(),
    completedTasks: v.array(v.any()),
    inProgressTasks: v.array(v.any()),
    pendingTasks: v.array(v.any()),
    failedTasks: v.array(v.any()),
    insights: v.array(v.string()),
    blockers: v.array(v.string()),
    suggestions: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_date", ["date"]),

  // Performance metrics table
  metrics: defineTable({
    date: v.string(),
    totalTasks: v.number(),
    completedTasks: v.number(),
    failedTasks: v.number(),
    averageCompletionTime: v.number(),
    agentUtilization: v.any(),
    topErrors: v.array(v.string()),
    improvementAreas: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_date", ["date"]),

  // Learnings table (for self-improvement)
  learnings: defineTable({
    taskId: v.string(),
    taskType: v.string(),
    learnings: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_type", ["taskType"]),

  // Suggestions table
  suggestions: defineTable({
    title: v.string(),
    description: v.string(),
    type: v.string(),
    priority: v.string(),
    rationale: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
    actedOnAt: v.optional(v.number()),
  })
    .index("by_status", ["status"]),

  // Events table (for Mission Control integration)
  events: defineTable({
    eventId: v.string(),
    type: v.string(),
    payload: v.any(),
    processed: v.boolean(),
    timestamp: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_processed", ["processed"])
    .index("by_timestamp", ["timestamp"]),

  // Event processing tracking
  eventTracking: defineTable({
    lastProcessedTimestamp: v.number(),
    updatedAt: v.number(),
  }),
});