/**
 * Convex Agent Functions
 * Database operations for agents
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ======== QUERIES ========

export const get = query({
  args: { id: v.string() },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
  },
});

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const listAvailable = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", "idle"))
      .collect();
  },
});

export const listByStatus = query({
  args: { status: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

export const byCapability = query({
  args: { capability: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const agents = await ctx.db.query("agents").collect();
    return agents.filter((agent) =>
      agent.capabilities.includes(args.capability)
    );
  },
});

// ======== MUTATIONS ========

export const create = mutation({
  args: { agent: v.any() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const agentId = await ctx.db.insert("agents", args.agent);
    return agentId;
  },
});

export const update = mutation({
  args: { id: v.string(), updates: v.any() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!agent) {
      return false;
    }
    
    await ctx.db.patch(agent._id, args.updates);
    return true;
  },
});

export const deleteAgent = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!agent) {
      return false;
    }
    
    await ctx.db.delete(agent._id);
    return true;
  },
});

export const updateStats = mutation({
  args: {
    id: v.string(),
    duration: v.number(),
    success: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!agent) {
      return false;
    }
    
    const totalTasks = agent.totalTasksCompleted + agent.totalTasksFailed + 1;
    const newSuccessRate = args.success
      ? ((agent.totalTasksCompleted + 1) / totalTasks) * 100
      : (agent.totalTasksCompleted / totalTasks) * 100;
    
    const totalDuration = agent.averageTaskDuration * (totalTasks - 1) + args.duration;
    const newAverageDuration = totalDuration / totalTasks;
    
    await ctx.db.patch(agent._id, {
      totalTasksCompleted: args.success
        ? agent.totalTasksCompleted + 1
        : agent.totalTasksCompleted,
      totalTasksFailed: args.success
        ? agent.totalTasksFailed
        : agent.totalTasksFailed + 1,
      averageTaskDuration: newAverageDuration,
      successRate: newSuccessRate,
      lastActiveAt: Date.now(),
    });
    
    return true;
  },
});

export const heartbeat = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!agent) {
      return false;
    }
    
    await ctx.db.patch(agent._id, {
      lastActiveAt: Date.now(),
    });
    
    return true;
  },
});