const { getTeamMemberTasks, getTaskDetails, getTeamMemberActivity, getProjectStats, searchIssues, getTeamWorkload } = require('../services/jiraService');

/**
 * Jira Integration Handler
 * Provides endpoints for Jira task management and team workload analysis
 */

exports.getTeamMemberTasks = async (event, context) => {
  try {
    console.log('Fetching Jira tasks for team member:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching Jira tasks for: ${teamMember}`);
    
    const tasks = await getTeamMemberTasks(teamMember);
    
    // Categorize tasks for better insights
    const taskAnalysis = analyzeTasks(tasks);
    
    const response = {
      success: true,
      teamMember,
      timestamp: new Date().toISOString(),
      data: {
        tasks,
        analysis: taskAnalysis,
        summary: {
          totalTasks: tasks.length,
          highPriorityTasks: tasks.filter(task => 
            task.priority.name === 'High' || task.priority.name === 'Highest'
          ).length,
          inProgressTasks: tasks.filter(task => 
            task.status.category === 'In Progress'
          ).length,
          todoTasks: tasks.filter(task => 
            task.status.category === 'To Do'
          ).length,
          doneTasks: tasks.filter(task => 
            task.status.category === 'Done'
          ).length
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching Jira tasks:', error);
    return createErrorResponse(500, 'Failed to fetch Jira tasks', error.message);
  }
};

exports.getTaskDetails = async (event, context) => {
  try {
    console.log('Fetching Jira task details:', JSON.stringify(event, null, 2));
    
    const taskKey = event.pathParameters?.taskKey;
    
    if (!taskKey) {
      return createErrorResponse(400, 'Task key is required');
    }

    console.log(`Fetching details for Jira task: ${taskKey}`);
    
    const taskDetails = await getTaskDetails(taskKey);
    
    if (!taskDetails) {
      return createErrorResponse(404, `Task ${taskKey} not found`);
    }

    const response = {
      success: true,
      taskKey,
      timestamp: new Date().toISOString(),
      data: taskDetails
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching Jira task details:', error);
    return createErrorResponse(500, 'Failed to fetch task details', error.message);
  }
};

exports.getTeamMemberActivity = async (event, context) => {
  try {
    console.log('Fetching team member Jira activity:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    const days = parseInt(event.queryStringParameters?.days) || 7;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching ${days} days of Jira activity for: ${teamMember}`);
    
    const activity = await getTeamMemberActivity(teamMember, days);
    
    const response = {
      success: true,
      teamMember,
      days,
      timestamp: new Date().toISOString(),
      data: {
        activity,
        summary: {
          updatedIssues: activity.updatedIssues.length,
          createdIssues: activity.createdIssues.length,
          resolvedIssues: activity.resolvedIssues.length,
          totalActivity: activity.updatedIssues.length + activity.createdIssues.length + activity.resolvedIssues.length
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching team member Jira activity:', error);
    return createErrorResponse(500, 'Failed to fetch Jira activity', error.message);
  }
};

exports.getProjectStats = async (event, context) => {
  try {
    console.log('Fetching Jira project statistics:', JSON.stringify(event, null, 2));
    
    const projectKey = event.pathParameters?.projectKey;
    
    if (!projectKey) {
      return createErrorResponse(400, 'Project key is required');
    }

    console.log(`Fetching statistics for Jira project: ${projectKey}`);
    
    const projectStats = await getProjectStats(projectKey);
    
    if (!projectStats) {
      return createErrorResponse(404, `Project ${projectKey} not found`);
    }

    const response = {
      success: true,
      projectKey,
      timestamp: new Date().toISOString(),
      data: projectStats
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching Jira project statistics:', error);
    return createErrorResponse(500, 'Failed to fetch project statistics', error.message);
  }
};

exports.searchIssues = async (event, context) => {
  try {
    console.log('Searching Jira issues:', JSON.stringify(event, null, 2));
    
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { jql, maxResults = 50 } = body;
    
    if (!jql) {
      return createErrorResponse(400, 'JQL query is required');
    }

    console.log(`Searching Jira issues with JQL: ${jql}`);
    
    const issues = await searchIssues(jql, maxResults);
    
    const response = {
      success: true,
      jql,
      maxResults,
      timestamp: new Date().toISOString(),
      data: {
        issues,
        count: issues.length
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error searching Jira issues:', error);
    return createErrorResponse(500, 'Failed to search Jira issues', error.message);
  }
};

exports.getTeamWorkload = async (event, context) => {
  try {
    console.log('Calculating team Jira workload:', JSON.stringify(event, null, 2));
    
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { teamMembers } = body;
    
    if (!teamMembers || !Array.isArray(teamMembers) || teamMembers.length === 0) {
      return createErrorResponse(400, 'Team members array is required');
    }

    console.log(`Calculating workload for team members: ${teamMembers.join(', ')}`);
    
    const workload = await getTeamWorkload(teamMembers);
    
    // Calculate team statistics
    const teamStats = calculateTeamStats(workload);
    
    const response = {
      success: true,
      teamMembers,
      timestamp: new Date().toISOString(),
      data: {
        workload,
        teamStats,
        insights: generateWorkloadInsights(workload)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error calculating team Jira workload:', error);
    return createErrorResponse(500, 'Failed to calculate team workload', error.message);
  }
};

/**
 * Analyze tasks to provide insights
 */
function analyzeTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return {
      overdueTasks: [],
      staleTasks: [],
      priorityDistribution: {},
      statusDistribution: {},
      recommendations: []
    };
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Find stale tasks (not updated in a week)
  const staleTasks = tasks.filter(task => 
    new Date(task.updated) < oneWeekAgo
  );

  // Priority distribution
  const priorityDistribution = tasks.reduce((acc, task) => {
    const priority = task.priority.name;
    acc[priority] = (acc[priority] || 0) + 1;
    return acc;
  }, {});

  // Status distribution
  const statusDistribution = tasks.reduce((acc, task) => {
    const status = task.status.name;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  // Generate recommendations
  const recommendations = [];
  
  if (staleTasks.length > 0) {
    recommendations.push(`${staleTasks.length} tasks haven't been updated in over a week - consider reviewing progress`);
  }
  
  const highPriorityTasks = tasks.filter(task => 
    task.priority.name === 'High' || task.priority.name === 'Highest'
  );
  
  if (highPriorityTasks.length > 3) {
    recommendations.push(`${highPriorityTasks.length} high priority tasks - consider focusing efforts`);
  }
  
  const inProgressTasks = tasks.filter(task => 
    task.status.category === 'In Progress'
  );
  
  if (inProgressTasks.length > 5) {
    recommendations.push(`${inProgressTasks.length} tasks in progress - consider limiting WIP`);
  }

  return {
    staleTasks: staleTasks.map(task => ({
      key: task.key,
      summary: task.summary,
      daysSinceUpdate: Math.floor((now - new Date(task.updated)) / (1000 * 60 * 60 * 24))
    })),
    priorityDistribution,
    statusDistribution,
    recommendations
  };
}

/**
 * Calculate team statistics from workload data
 */
function calculateTeamStats(workload) {
  const members = Object.keys(workload);
  
  if (members.length === 0) {
    return {
      totalMembers: 0,
      totalTasks: 0,
      averageTasksPerMember: 0,
      workloadBalance: 'N/A'
    };
  }

  const totalTasks = members.reduce((sum, member) => sum + workload[member].totalTasks, 0);
  const averageTasksPerMember = Math.round(totalTasks / members.length * 100) / 100;
  
  // Calculate workload balance (standard deviation)
  const taskCounts = members.map(member => workload[member].totalTasks);
  const variance = taskCounts.reduce((sum, count) => sum + Math.pow(count - averageTasksPerMember, 2), 0) / members.length;
  const standardDeviation = Math.sqrt(variance);
  
  let workloadBalance = 'Balanced';
  if (standardDeviation > averageTasksPerMember * 0.5) {
    workloadBalance = 'Unbalanced';
  } else if (standardDeviation > averageTasksPerMember * 0.3) {
    workloadBalance = 'Slightly Unbalanced';
  }

  return {
    totalMembers: members.length,
    totalTasks,
    averageTasksPerMember,
    workloadBalance,
    standardDeviation: Math.round(standardDeviation * 100) / 100
  };
}

/**
 * Generate workload insights
 */
function generateWorkloadInsights(workload) {
  const insights = [];
  const members = Object.keys(workload);
  
  if (members.length === 0) {
    return ['No workload data available'];
  }

  // Find overloaded members
  const taskCounts = members.map(member => workload[member].totalTasks);
  const averageTasks = taskCounts.reduce((sum, count) => sum + count, 0) / members.length;
  
  const overloadedMembers = members.filter(member => 
    workload[member].totalTasks > averageTasks * 1.5
  );
  
  if (overloadedMembers.length > 0) {
    insights.push(`Overloaded members: ${overloadedMembers.join(', ')} - consider redistributing tasks`);
  }

  // Find members with many high priority tasks
  const highPriorityMembers = members.filter(member => 
    workload[member].highPriority > 3
  );
  
  if (highPriorityMembers.length > 0) {
    insights.push(`Members with many high priority tasks: ${highPriorityMembers.join(', ')}`);
  }

  // Find members with many in-progress tasks
  const wipMembers = members.filter(member => 
    workload[member].inProgress > 5
  );
  
  if (wipMembers.length > 0) {
    insights.push(`Members with high WIP: ${wipMembers.join(', ')} - consider limiting work in progress`);
  }

  if (insights.length === 0) {
    insights.push('Team workload appears well balanced');
  }

  return insights;
}

/**
 * Helper functions for response formatting
 */
function createSuccessResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function createErrorResponse(statusCode, message, details = null) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    },
    body: JSON.stringify({
      success: false,
      error: message,
      details,
      timestamp: new Date().toISOString()
    })
  };
}
