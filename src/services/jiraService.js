const axios = require('axios');

/**
 * Jira Service for fetching team member tasks and project information
 */
class JiraService {
  constructor() {
    this.baseURL = process.env.JIRA_BASE_URL;
    this.email = process.env.JIRA_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    
    if (!this.baseURL || !this.email || !this.apiToken) {
      console.warn('Jira configuration incomplete. Some features may not work.');
    }
    
    // Create axios instance with authentication
    this.client = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: this.email,
        password: this.apiToken
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get tasks assigned to a specific team member
   */
  async getTeamMemberTasks(teamMemberName) {
    try {
      console.log(`Fetching Jira tasks for ${teamMemberName}`);
      
      if (!this.baseURL || !this.apiToken) {
        console.warn('Jira not configured, returning empty tasks');
        return [];
      }

      // Search for issues assigned to the team member
      const jql = `assignee = "${teamMemberName}" AND resolution = Unresolved ORDER BY updated DESC`;
      
      const response = await this.client.get('/rest/api/3/search', {
        params: {
          jql: jql,
          maxResults: 50,
          fields: [
            'summary',
            'status',
            'priority',
            'assignee',
            'reporter',
            'created',
            'updated',
            'description',
            'issuetype',
            'project',
            'fixVersions',
            'components',
            'labels',
            'timetracking',
            'progress'
          ].join(',')
        }
      });

      const issues = response.data.issues || [];
      console.log(`Found ${issues.length} Jira tasks for ${teamMemberName}`);

      // Transform issues to a more usable format
      return issues.map(issue => ({
        key: issue.key,
        id: issue.id,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: {
          name: issue.fields.status.name,
          category: issue.fields.status.statusCategory.name,
          id: issue.fields.status.id
        },
        priority: {
          name: issue.fields.priority?.name || 'None',
          id: issue.fields.priority?.id
        },
        issueType: {
          name: issue.fields.issuetype.name,
          iconUrl: issue.fields.issuetype.iconUrl
        },
        project: {
          key: issue.fields.project.key,
          name: issue.fields.project.name
        },
        assignee: {
          displayName: issue.fields.assignee?.displayName,
          emailAddress: issue.fields.assignee?.emailAddress
        },
        reporter: {
          displayName: issue.fields.reporter?.displayName,
          emailAddress: issue.fields.reporter?.emailAddress
        },
        created: issue.fields.created,
        updated: issue.fields.updated,
        labels: issue.fields.labels || [],
        components: issue.fields.components?.map(c => c.name) || [],
        fixVersions: issue.fields.fixVersions?.map(v => v.name) || [],
        timeTracking: {
          originalEstimate: issue.fields.timetracking?.originalEstimate,
          remainingEstimate: issue.fields.timetracking?.remainingEstimate,
          timeSpent: issue.fields.timetracking?.timeSpent
        },
        progress: {
          progress: issue.fields.progress?.progress || 0,
          total: issue.fields.progress?.total || 0,
          percent: issue.fields.progress?.percent || 0
        },
        url: `${this.baseURL}/browse/${issue.key}`
      }));

    } catch (error) {
      console.error('Error fetching Jira tasks:', error.message);
      
      if (error.response) {
        console.error('Jira API Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      // Return empty array instead of throwing to prevent breaking the standup process
      return [];
    }
  }

  /**
   * Get task details by key
   */
  async getTaskDetails(taskKey) {
    try {
      console.log(`Fetching details for Jira task ${taskKey}`);
      
      if (!this.baseURL || !this.apiToken) {
        return null;
      }

      const response = await this.client.get(`/rest/api/3/issue/${taskKey}`, {
        params: {
          fields: [
            'summary',
            'status',
            'priority',
            'assignee',
            'reporter',
            'created',
            'updated',
            'description',
            'issuetype',
            'project',
            'fixVersions',
            'components',
            'labels',
            'timetracking',
            'progress',
            'comment',
            'worklog'
          ].join(','),
          expand: 'changelog'
        }
      });

      const issue = response.data;
      
      return {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name || 'None',
        assignee: issue.fields.assignee?.displayName,
        created: issue.fields.created,
        updated: issue.fields.updated,
        comments: issue.fields.comment?.comments?.length || 0,
        worklogEntries: issue.fields.worklog?.worklogs?.length || 0,
        url: `${this.baseURL}/browse/${issue.key}`
      };

    } catch (error) {
      console.error(`Error fetching Jira task details for ${taskKey}:`, error.message);
      return null;
    }
  }

  /**
   * Get team member's recent activity
   */
  async getTeamMemberActivity(teamMemberName, days = 7) {
    try {
      console.log(`Fetching recent activity for ${teamMemberName} (last ${days} days)`);
      
      if (!this.baseURL || !this.apiToken) {
        return {
          updatedIssues: [],
          createdIssues: [],
          resolvedIssues: []
        };
      }

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
      const dateString = dateFrom.toISOString().split('T')[0];

      // Get updated issues
      const updatedJql = `assignee = "${teamMemberName}" AND updated >= "${dateString}" ORDER BY updated DESC`;
      const updatedResponse = await this.client.get('/rest/api/3/search', {
        params: {
          jql: updatedJql,
          maxResults: 20,
          fields: 'summary,status,updated'
        }
      });

      // Get created issues
      const createdJql = `reporter = "${teamMemberName}" AND created >= "${dateString}" ORDER BY created DESC`;
      const createdResponse = await this.client.get('/rest/api/3/search', {
        params: {
          jql: createdJql,
          maxResults: 20,
          fields: 'summary,status,created'
        }
      });

      // Get resolved issues
      const resolvedJql = `assignee = "${teamMemberName}" AND resolved >= "${dateString}" ORDER BY resolved DESC`;
      const resolvedResponse = await this.client.get('/rest/api/3/search', {
        params: {
          jql: resolvedJql,
          maxResults: 20,
          fields: 'summary,status,resolved'
        }
      });

      return {
        updatedIssues: updatedResponse.data.issues?.map(issue => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          updated: issue.fields.updated
        })) || [],
        createdIssues: createdResponse.data.issues?.map(issue => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          created: issue.fields.created
        })) || [],
        resolvedIssues: resolvedResponse.data.issues?.map(issue => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          resolved: issue.fields.resolved
        })) || []
      };

    } catch (error) {
      console.error('Error fetching team member activity:', error.message);
      return {
        updatedIssues: [],
        createdIssues: [],
        resolvedIssues: []
      };
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStats(projectKey) {
    try {
      console.log(`Fetching project statistics for ${projectKey}`);
      
      if (!this.baseURL || !this.apiToken) {
        return null;
      }

      // Get project info
      const projectResponse = await this.client.get(`/rest/api/3/project/${projectKey}`);
      const project = projectResponse.data;

      // Get issue counts by status
      const statusJql = `project = "${projectKey}"`;
      const statusResponse = await this.client.get('/rest/api/3/search', {
        params: {
          jql: statusJql,
          maxResults: 0,
          facet: true
        }
      });

      return {
        key: project.key,
        name: project.name,
        description: project.description,
        lead: project.lead?.displayName,
        totalIssues: statusResponse.data.total,
        url: `${this.baseURL}/projects/${project.key}`
      };

    } catch (error) {
      console.error(`Error fetching project stats for ${projectKey}:`, error.message);
      return null;
    }
  }

  /**
   * Search issues with custom JQL
   */
  async searchIssues(jql, maxResults = 50) {
    try {
      console.log(`Searching Jira issues with JQL: ${jql}`);
      
      if (!this.baseURL || !this.apiToken) {
        return [];
      }

      const response = await this.client.get('/rest/api/3/search', {
        params: {
          jql: jql,
          maxResults: maxResults,
          fields: 'summary,status,assignee,priority,created,updated'
        }
      });

      return response.data.issues?.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName,
        priority: issue.fields.priority?.name,
        created: issue.fields.created,
        updated: issue.fields.updated,
        url: `${this.baseURL}/browse/${issue.key}`
      })) || [];

    } catch (error) {
      console.error('Error searching Jira issues:', error.message);
      return [];
    }
  }

  /**
   * Get team workload distribution
   */
  async getTeamWorkload(teamMembers) {
    try {
      console.log('Calculating team workload distribution');
      
      if (!this.baseURL || !this.apiToken || !teamMembers || teamMembers.length === 0) {
        return {};
      }

      const workload = {};
      
      for (const member of teamMembers) {
        const tasks = await this.getTeamMemberTasks(member);
        workload[member] = {
          totalTasks: tasks.length,
          inProgress: tasks.filter(task => task.status.category === 'In Progress').length,
          todo: tasks.filter(task => task.status.category === 'To Do').length,
          done: tasks.filter(task => task.status.category === 'Done').length,
          highPriority: tasks.filter(task => task.priority.name === 'High' || task.priority.name === 'Highest').length,
          tasks: tasks.slice(0, 5) // Top 5 tasks for summary
        };
      }

      return workload;

    } catch (error) {
      console.error('Error calculating team workload:', error.message);
      return {};
    }
  }
}

// Create singleton instance
const jiraService = new JiraService();

// Export functions for backward compatibility
module.exports = {
  getTeamMemberTasks: (teamMemberName) => jiraService.getTeamMemberTasks(teamMemberName),
  getTaskDetails: (taskKey) => jiraService.getTaskDetails(taskKey),
  getTeamMemberActivity: (teamMemberName, days) => jiraService.getTeamMemberActivity(teamMemberName, days),
  getProjectStats: (projectKey) => jiraService.getProjectStats(projectKey),
  searchIssues: (jql, maxResults) => jiraService.searchIssues(jql, maxResults),
  getTeamWorkload: (teamMembers) => jiraService.getTeamWorkload(teamMembers),
  jiraService
};
