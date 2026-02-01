/**
 * GitHub API Integration Service
 * Handles repository operations, issues, PRs, and code management
 */

import { Octokit } from '@octokit/rest';
import { GitHubIssue, GitHubPR, Task } from '../types';
import { logger } from '../utils/logger';

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token?: string, owner?: string, repo?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
    this.owner = owner || process.env.GITHUB_OWNER || 'SofiaClaw';
    this.repo = repo || process.env.GITHUB_REPO || 'second-brain';
  }

  /**
   * Get repository information
   */
  async getRepository() {
    try {
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return data;
    } catch (error) {
      logger.error('Failed to get repository', { error, owner: this.owner, repo: this.repo });
      throw error;
    }
  }

  /**
   * List open issues
   */
  async listIssues(state: 'open' | 'closed' | 'all' = 'open', labels?: string[]): Promise<GitHubIssue[]> {
    try {
      const { data } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state,
        labels: labels?.join(','),
        per_page: 100,
      });

      return data.map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        author: issue.user?.login || 'unknown',
        url: issue.html_url,
      }));
    } catch (error) {
      logger.error('Failed to list issues', { error });
      throw error;
    }
  }

  /**
   * Get a single issue
   */
  async getIssue(number: number): Promise<GitHubIssue> {
    try {
      const { data } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        labels: data.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        author: data.user?.login || 'unknown',
        url: data.html_url,
      };
    } catch (error) {
      logger.error('Failed to get issue', { error, number });
      throw error;
    }
  }

  /**
   * Create an issue from a task
   */
  async createIssueFromTask(task: Task): Promise<GitHubIssue> {
    try {
      const body = this.formatTaskAsIssueBody(task);
      
      const { data } = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: task.title,
        body,
        labels: [...task.tags, task.type, task.priority],
      });

      logger.info('Created GitHub issue from task', { 
        taskId: task.id, 
        issueNumber: data.number 
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        labels: data.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        author: data.user?.login || 'unknown',
        url: data.html_url,
      };
    } catch (error) {
      logger.error('Failed to create issue from task', { error, taskId: task.id });
      throw error;
    }
  }

  /**
   * Update an issue
   */
  async updateIssue(number: number, updates: { title?: string; body?: string; state?: 'open' | 'closed' }) {
    try {
      const { data } = await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        ...updates,
      });
      return data;
    } catch (error) {
      logger.error('Failed to update issue', { error, number });
      throw error;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPR[]> {
    try {
      const { data } = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state,
        per_page: 100,
      });

      return data.map(pr => ({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state as 'open' | 'closed' | 'merged',
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        author: pr.user?.login || 'unknown',
        url: pr.html_url,
      }));
    } catch (error) {
      logger.error('Failed to list pull requests', { error });
      throw error;
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    title: string,
    head: string,
    base: string,
    body: string
  ): Promise<GitHubPR> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        head,
        base,
        body,
      });

      logger.info('Created pull request', { 
        prNumber: data.number,
        branch: head,
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed' | 'merged',
        branch: data.head.ref,
        baseBranch: data.base.ref,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        author: data.user?.login || 'unknown',
        url: data.html_url,
      };
    } catch (error) {
      logger.error('Failed to create pull request', { error, head, base });
      throw error;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(path: string, ref?: string): Promise<{ content: string; sha: string }> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });

      if ('content' in data && typeof data.content === 'string') {
        return {
          content: Buffer.from(data.content, 'base64').toString('utf-8'),
          sha: data.sha,
        };
      }
      throw new Error('Not a file');
    } catch (error) {
      logger.error('Failed to get file content', { error, path, ref });
      throw error;
    }
  }

  /**
   * Create or update a file
   */
  async createOrUpdateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ) {
    try {
      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
      });

      logger.info('File created/updated', { path, branch, commit: data.commit.sha });
      return data;
    } catch (error) {
      logger.error('Failed to create/update file', { error, path, branch });
      throw error;
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, fromBranch: string = 'main') {
    try {
      // Get the SHA of the latest commit on the base branch
      const { data: refData } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${fromBranch}`,
      });

      // Create the new branch
      const { data } = await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      });

      logger.info('Created branch', { branchName, fromBranch });
      return data;
    } catch (error) {
      logger.error('Failed to create branch', { error, branchName, fromBranch });
      throw error;
    }
  }

  /**
   * Get repository tree
   */
  async getTree(ref: string = 'main', recursive: boolean = true) {
    try {
      const { data } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: ref,
        recursive: recursive ? '1' : undefined,
      });
      return data;
    } catch (error) {
      logger.error('Failed to get tree', { error, ref });
      throw error;
    }
  }

  /**
   * Search code in repository
   */
  async searchCode(query: string) {
    try {
      const { data } = await this.octokit.search.code({
        q: `${query} repo:${this.owner}/${this.repo}`,
      });
      return data;
    } catch (error) {
      logger.error('Failed to search code', { error, query });
      throw error;
    }
  }

  /**
   * Add comment to issue
   */
  async addIssueComment(issueNumber: number, body: string) {
    try {
      const { data } = await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
      return data;
    } catch (error) {
      logger.error('Failed to add issue comment', { error, issueNumber });
      throw error;
    }
  }

  /**
   * Format task as issue body
   */
  private formatTaskAsIssueBody(task: Task): string {
    const lines = [
      `## Description`,
      task.description,
      ``,
      `## Details`,
      `- **Type:** ${task.type}`,
      `- **Priority:** ${task.priority}`,
      `- **Created by:** ${task.createdBy}`,
      `- **SOFIA Task ID:** ${task.id}`,
    ];

    if (task.estimatedHours) {
      lines.push(`- **Estimated Hours:** ${task.estimatedHours}`);
    }

    if (task.tags.length > 0) {
      lines.push(`- **Tags:** ${task.tags.join(', ')}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('*This issue was auto-generated by SOFIA Autonomous System*');

    return lines.join('\n');
  }

  /**
   * Get commit history
   */
  async getCommits(sha?: string, path?: string, since?: string, until?: string) {
    try {
      const { data } = await this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha,
        path,
        since,
        until,
        per_page: 100,
      });
      return data;
    } catch (error) {
      logger.error('Failed to get commits', { error });
      throw error;
    }
  }
}