/**
 * Winston logger configuration for SOFIA
 */

import winston from 'winston';
import path from 'path';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');

// Logger configuration
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'sofia-autonomous',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Console output
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      ),
    }),
    
    // File output - all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: combine(timestamp(), json()),
    }),
    
    // File output - error logs only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), json()),
    }),
    
    // File output - agent activity
    new winston.transports.File({
      filename: path.join(logsDir, 'agents.log'),
      format: combine(timestamp(), json()),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') }),
  ],
});

// Helper to create a child logger with agent context
export function createAgentLogger(agentId: string, agentName: string) {
  return logger.child({
    agentId,
    agentName,
    context: 'agent',
  });
}

// Helper to create a child logger with task context
export function createTaskLogger(taskId: string, taskType: string) {
  return logger.child({
    taskId,
    taskType,
    context: 'task',
  });
}

// Helper to create a child logger with session context
export function createSessionLogger(sessionId: string, agentId: string) {
  return logger.child({
    sessionId,
    agentId,
    context: 'session',
  });
}