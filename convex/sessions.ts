/**
 * Convex Session Functions
 * Database operations for agent sessions
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ======== QUERIES ========

export const get = query({
  args: { id: v.string() },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
  },
});

export const getByTask = query({
  args: { taskId: v.string() },
  returns: v.optional(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .order("desc")
      .take(args.limit || 100);
  },
});

export const listActive = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "starting"),
          q.eq(q.field("status"), "running")
        )
      )
      .collect();
  },
});

export const listByAgent = query({
  args: { agentId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit || 50);
  },
});

export const listByStatus = query({
  args: { status: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

export const completedToday = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.gte(q.field("endedAt"), startOfDay.getTime())
        )
      )
      .collect();
    
    return sessions.length;
  },
});

// ======== MUTATIONS ========

export const create = mutation({
  args: { session: v.any() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("sessions", args.session);
    return sessionId;
  },
});

export const update = mutation({
  args: { id: v.string(), updates: v.any() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!session) {
      return false;
    }
    
    await ctx.db.patch(session._id, args.updates);
    return true;
  },
});

export const appendLog = mutation({
  args: {
    id: v.string(),
    log: v.any(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!session) {
      return false;
    }
    
    const logs = [...(session.logs || []), args.log];
    
    // Keep only last 1000 logs to prevent document size issues
    if (logs.length > 1000) {
      logs.shift();
    }
    
    await ctx.db.patch(session._id, { logs });
    return true;
  },
});

export const deleteSession = mutation({
  args: { id: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("id"), args.id))
      .first();
    
    if (!session) {
      return false;
    }
    
    await ctx.db.delete(session._id);
    return true;
  },
});

export const cleanupOld = mutation({
  args: { olderThanDays: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
    
    const oldSessions = await ctx.db
      .query("sessions")
      .filter((q) =>
        q.and(
          q.lt(q.field("startedAt"), cutoff),
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed"),
            q.eq(q.field("status"), "cancelled")
          )
        )
      )
      .collect();
    
    for (const session of oldSessions) {
      await ctx.db.delete(session._id);
    }
    
    return oldSessions.length;
  },
});