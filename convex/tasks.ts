/**
 * Convex Task Functions
 * Database operations for tasks
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ======== QUERIES ========

export const get = query({
  args: { id: v.string() },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_id", (q) => q.eq("id", args.id))
      .first();
  },
});

export const list = query({
  args: { 
    limit: v.optional(v.number()), 
    offset: v.optional(v.number()) 
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .order("desc")
      .take(args.limit || 100);
    return tasks;
  },
});

export const listByStatus = query({
  args: { status: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

export const listPending = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const listActive = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "assigned"),
          q.eq(q.field("status"), "in_progress")
        )
      )
      .collect();
  },
});

export const byType = query({
  args: { type: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
  },
});

export const createdBetween = query({
  args: { startTime: v.number(), endTime: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_created", (q) =>
        q.gte("createdAt", args.startTime).lte("createdAt", args.endTime)
      )
      .collect();
  },
});

export const completedBetween = query({
  args: { startTime: v.number(), endTime: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.gte(q.field("completedAt"), args.startTime),
          q.lte(q.field("completedAt"), args.endTime)
        )
      )
      .collect();
  },
});

export const failedBetween = query({
  args: { startTime: v.number(), endTime: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "failed"),
          q.gte(q.field("updatedAt"), args.startTime),
          q.lte(q.field("updatedAt"), args.endTime)
        )
      )
      .collect();
  },
});

export const byAgent = query({
  args: { agentId: v.string(), startTime: v.number(), endTime: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.eq(q.field("assignedTo"), args.agentId),
          q.gte(q.field("createdAt"), args.startTime),
          q.lte(q.field("createdAt"), args.endTime)
        )
      )
      .collect();
  },
});

export const countByType = query({
  args: { agentId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    let query = ctx.db.query("tasks");
    
    if (args.agentId) {
      query = query.filter((q) => q.eq(q.field("assignedTo"), args.agentId));
    }
    
    const tasks = await query.collect();
    const counts: Record<string, number> = {};
    
    for (const task of tasks) {
      counts[task.type] = (counts[task.type] || 0) + 1;
    }
    
    return counts;
  },
});

export const stale = query({
  args: { olderThanDays: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
    
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.lt(q.field("updatedAt"), cutoff),
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "assigned")
          )
        )
      )
      .collect();
  },
});

export const recentFailures = query({
  args: { limit: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("status"), "failed"))
      .order("desc")
      .take(args.limit);
  },
});

// ======== MUTATIONS ========

export const create = mutation({
  args: { task: v.any() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", args.task);
    return taskId;
  },
});

export const update = mutation({
  args: { id: v.string(), updates: v.any() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!task) {
      return false;
    }
    
    await ctx.db.patch(task._id, args.updates);
    return true;
  },
});

export const deleteTask = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!task) {
      return false;
    }
    
    await ctx.db.delete(task._id);
    return true;
  },
});