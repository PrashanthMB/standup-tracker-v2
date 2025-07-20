const { getStandupHistory, getTeamMetrics, getPreviousUpdates } = require('../services/storageService');
const { analyzeStandupPatterns } = require('../services/aiService');

/**
 * Data Retrieval Handler
 * Provides endpoints for accessing standup history, team metrics, and analytics
 */

exports.getStandupHistory = async (event, context) => {
  try {
    console.log('Fetching standup history:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;
    const format = event.queryStringParameters?.format || 'json';
    const limit = parseInt(event.queryStringParameters?.limit) || 50;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching standup history for ${teamMember} from ${startDate || 'beginning'} to ${endDate || 'now'} in ${format} format`);
    
    const history = await getStandupHistory(teamMember, startDate, endDate, format);
    
    if (history.length === 0) {
      return createSuccessResponse({
        success: true,
        teamMember,
        message: `No standup history found for ${teamMember}`,
        data: {
          history: [],
          summary: {
            totalEntries: 0,
            dateRange: null,
            patterns: null
          }
        }
      });
    }

    // Limit results if requested
    const limitedHistory = history.slice(0, limit);
    
    // Generate analytics if we have JSON data
    let patterns = null;
    let analytics = null;
    
    if (format === 'json' && limitedHistory.length > 0) {
      try {
        patterns = await analyzeStandupPatterns(teamMember, limitedHistory[0], limitedHistory);
        analytics = generateHistoryAnalytics(limitedHistory);
      } catch (analysisError) {
        console.warn('Error generating patterns analysis:', analysisError);
      }
    }

    const response = {
      success: true,
      teamMember,
      format,
      timestamp: new Date().toISOString(),
      data: {
        history: limitedHistory,
        summary: {
          totalEntries: limitedHistory.length,
          totalAvailable: history.length,
          dateRange: limitedHistory.length > 0 ? {
            from: limitedHistory[limitedHistory.length - 1].timestamp || limitedHistory[limitedHistory.length - 1].date,
            to: limitedHistory[0].timestamp || limitedHistory[0].date
          } : null,
          patterns,
          analytics
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching standup history:', error);
    return createErrorResponse(500, 'Failed to fetch standup history', error.message);
  }
};

exports.getTeamMetrics = async (event, context) => {
  try {
    console.log('Fetching team metrics:', JSON.stringify(event, null, 2));
    
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;
    const includeDetails = event.queryStringParameters?.includeDetails === 'true';
    
    console.log(`Fetching team metrics from ${startDate || 'beginning'} to ${endDate || 'now'}`);
    
    const metrics = await getTeamMetrics(startDate, endDate);
    
    // Generate additional insights
    const insights = generateTeamInsights(metrics);
    const recommendations = generateTeamRecommendations(metrics);
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      dateRange: {
        from: startDate || 'All time',
        to: endDate || 'Present'
      },
      data: {
        metrics,
        insights,
        recommendations,
        // Include detailed member stats only if requested
        memberDetails: includeDetails ? metrics.memberStats : null
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching team metrics:', error);
    return createErrorResponse(500, 'Failed to fetch team metrics', error.message);
  }
};

exports.getTeamMemberSummary = async (event, context) => {
  try {
    console.log('Fetching team member summary:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    const days = parseInt(event.queryStringParameters?.days) || 30;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching ${days} days summary for ${teamMember}`);
    
    // Get recent updates
    const recentUpdates = await getPreviousUpdates(teamMember, Math.min(days, 50));
    
    if (recentUpdates.length === 0) {
      return createSuccessResponse({
        success: true,
        teamMember,
        message: `No recent activity found for ${teamMember}`,
        data: {
          summary: {
            totalStandups: 0,
            averageTasksPerStandup: 0,
            averagePRsPerStandup: 0,
            blockerFrequency: 0,
            productivity: 'No data'
          }
        }
      });
    }

    // Calculate summary statistics
    const summary = calculateMemberSummary(recentUpdates, days);
    
    // Generate member-specific insights
    const memberInsights = generateMemberInsights(recentUpdates, summary);
    
    const response = {
      success: true,
      teamMember,
      days,
      timestamp: new Date().toISOString(),
      data: {
        summary,
        insights: memberInsights,
        recentActivity: recentUpdates.slice(0, 5).map(update => ({
          date: update.timestamp,
          yesterday: update.yesterday?.substring(0, 100) + (update.yesterday?.length > 100 ? '...' : ''),
          today: update.today?.substring(0, 100) + (update.today?.length > 100 ? '...' : ''),
          blockers: update.blockers,
          tasksCount: update.jiraTasks?.length || 0,
          prsCount: update.bitbucketPRs?.length || 0
        })),
        trends: analyzeMemberTrends(recentUpdates)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching team member summary:', error);
    return createErrorResponse(500, 'Failed to fetch team member summary', error.message);
  }
};

exports.getBlockerAnalysis = async (event, context) => {
  try {
    console.log('Fetching blocker analysis:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    const days = parseInt(event.queryStringParameters?.days) || 30;
    
    console.log(`Analyzing blockers for ${teamMember || 'all team members'} over ${days} days`);
    
    let blockerData;
    
    if (teamMember) {
      // Analyze blockers for specific team member
      const recentUpdates = await getPreviousUpdates(teamMember, days);
      blockerData = analyzeIndividualBlockers(teamMember, recentUpdates);
    } else {
      // Analyze blockers across the team
      const teamMetrics = await getTeamMetrics();
      blockerData = analyzeTeamBlockers(teamMetrics);
    }
    
    const response = {
      success: true,
      teamMember: teamMember || 'All team members',
      days,
      timestamp: new Date().toISOString(),
      data: blockerData
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching blocker analysis:', error);
    return createErrorResponse(500, 'Failed to fetch blocker analysis', error.message);
  }
};

exports.getProductivityMetrics = async (event, context) => {
  try {
    console.log('Fetching productivity metrics:', JSON.stringify(event, null, 2));
    
    const startDate = event.queryStringParameters?.startDate;
    const endDate = event.queryStringParameters?.endDate;
    const teamMember = event.queryStringParameters?.teamMember;
    
    console.log(`Fetching productivity metrics for ${teamMember || 'team'} from ${startDate || 'beginning'} to ${endDate || 'now'}`);
    
    let productivityData;
    
    if (teamMember) {
      // Individual productivity metrics
      const history = await getStandupHistory(teamMember, startDate, endDate);
      productivityData = calculateIndividualProductivity(teamMember, history);
    } else {
      // Team productivity metrics
      const teamMetrics = await getTeamMetrics(startDate, endDate);
      productivityData = calculateTeamProductivity(teamMetrics);
    }
    
    const response = {
      success: true,
      scope: teamMember || 'Team',
      dateRange: {
        from: startDate || 'All time',
        to: endDate || 'Present'
      },
      timestamp: new Date().toISOString(),
      data: productivityData
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching productivity metrics:', error);
    return createErrorResponse(500, 'Failed to fetch productivity metrics', error.message);
  }
};

/**
 * Generate analytics from standup history
 */
function generateHistoryAnalytics(history) {
  if (!history || history.length === 0) return null;

  const analytics = {
    totalEntries: history.length,
    averageTasksPerStandup: 0,
    averagePRsPerStandup: 0,
    blockerFrequency: 0,
    mostActiveDay: null,
    commonKeywords: [],
    workPatterns: {}
  };

  // Calculate averages
  let totalTasks = 0;
  let totalPRs = 0;
  let blockersCount = 0;
  const dayOfWeekCounts = {};
  const keywords = {};

  history.forEach(entry => {
    // Count tasks and PRs
    if (entry.jiraTasks) totalTasks += entry.jiraTasks.length;
    if (entry.bitbucketPRs) totalPRs += entry.bitbucketPRs.length;
    
    // Count blockers
    if (entry.blockers && entry.blockers.toLowerCase() !== 'none' && entry.blockers.trim() !== '') {
      blockersCount++;
    }
    
    // Track day of week
    const date = new Date(entry.timestamp);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    dayOfWeekCounts[dayOfWeek] = (dayOfWeekCounts[dayOfWeek] || 0) + 1;
    
    // Extract keywords from today's work
    if (entry.today) {
      const words = entry.today.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(word => {
        if (!['will', 'work', 'continue', 'today', 'yesterday', 'tomorrow'].includes(word)) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    }
  });

  analytics.averageTasksPerStandup = Math.round((totalTasks / history.length) * 100) / 100;
  analytics.averagePRsPerStandup = Math.round((totalPRs / history.length) * 100) / 100;
  analytics.blockerFrequency = Math.round((blockersCount / history.length) * 100);

  // Find most active day
  const maxDay = Object.entries(dayOfWeekCounts).reduce((max, [day, count]) => 
    count > max.count ? { day, count } : max, { day: null, count: 0 });
  analytics.mostActiveDay = maxDay.day;

  // Get common keywords
  analytics.commonKeywords = Object.entries(keywords)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  analytics.workPatterns = dayOfWeekCounts;

  return analytics;
}

/**
 * Generate team insights from metrics
 */
function generateTeamInsights(metrics) {
  const insights = [];

  if (metrics.totalStandups === 0) {
    insights.push({
      type: 'info',
      message: 'No standup data available yet',
      priority: 'low'
    });
    return insights;
  }

  // Participation insights
  if (metrics.activeMembers > 0) {
    const avgStandupsPerMember = metrics.totalStandups / metrics.activeMembers;
    if (avgStandupsPerMember < 5) {
      insights.push({
        type: 'concern',
        message: 'Low standup participation - encourage regular updates',
        priority: 'medium'
      });
    } else if (avgStandupsPerMember > 20) {
      insights.push({
        type: 'positive',
        message: 'Excellent standup participation across the team',
        priority: 'low'
      });
    }
  }

  // Workload insights
  if (metrics.averageTasksPerMember > 8) {
    insights.push({
      type: 'warning',
      message: 'High average task load - consider workload distribution',
      priority: 'high'
    });
  }

  if (metrics.averagePRsPerMember > 5) {
    insights.push({
      type: 'warning',
      message: 'Many open PRs per member - prioritize reviews',
      priority: 'medium'
    });
  }

  // Blocker insights
  if (metrics.topBlockers && metrics.topBlockers.length > 0) {
    const topBlocker = metrics.topBlockers[0];
    if (topBlocker.count > 3) {
      insights.push({
        type: 'concern',
        message: `Recurring blocker detected: "${topBlocker.blocker}" - needs attention`,
        priority: 'high'
      });
    }
  }

  return insights;
}

/**
 * Generate team recommendations
 */
function generateTeamRecommendations(metrics) {
  const recommendations = [];

  if (metrics.totalStandups === 0) {
    recommendations.push('Start conducting regular standup meetings');
    return recommendations;
  }

  // Participation recommendations
  if (metrics.activeMembers < 5) {
    recommendations.push('Encourage more team members to participate in standups');
  }

  // Workload recommendations
  if (metrics.averageTasksPerMember > 6) {
    recommendations.push('Review task distribution and consider load balancing');
  }

  if (metrics.averagePRsPerMember > 3) {
    recommendations.push('Implement regular PR review sessions');
  }

  // Blocker recommendations
  if (metrics.topBlockers && metrics.topBlockers.length > 2) {
    recommendations.push('Schedule blocker resolution sessions');
    recommendations.push('Consider creating a blocker escalation process');
  }

  if (recommendations.length === 0) {
    recommendations.push('Team metrics look healthy - keep up the good work!');
  }

  return recommendations;
}

/**
 * Calculate member summary statistics
 */
function calculateMemberSummary(recentUpdates, days) {
  const summary = {
    totalStandups: recentUpdates.length,
    averageTasksPerStandup: 0,
    averagePRsPerStandup: 0,
    blockerFrequency: 0,
    productivity: 'No data',
    consistency: 'No data'
  };

  if (recentUpdates.length === 0) return summary;

  // Calculate averages
  const totalTasks = recentUpdates.reduce((sum, update) => 
    sum + (update.jiraTasks?.length || 0), 0);
  const totalPRs = recentUpdates.reduce((sum, update) => 
    sum + (update.bitbucketPRs?.length || 0), 0);
  const blockersCount = recentUpdates.filter(update => 
    update.blockers && update.blockers.toLowerCase() !== 'none' && update.blockers.trim() !== '').length;

  summary.averageTasksPerStandup = Math.round((totalTasks / recentUpdates.length) * 100) / 100;
  summary.averagePRsPerStandup = Math.round((totalPRs / recentUpdates.length) * 100) / 100;
  summary.blockerFrequency = Math.round((blockersCount / recentUpdates.length) * 100);

  // Calculate productivity score
  const productivityScore = (summary.averageTasksPerStandup * 2) + summary.averagePRsPerStandup - (summary.blockerFrequency / 10);
  if (productivityScore > 8) {
    summary.productivity = 'High';
  } else if (productivityScore > 4) {
    summary.productivity = 'Medium';
  } else {
    summary.productivity = 'Low';
  }

  // Calculate consistency (standup frequency)
  const expectedStandups = Math.min(days, 30); // Assume max 1 standup per day
  const consistencyRate = (recentUpdates.length / expectedStandups) * 100;
  if (consistencyRate > 80) {
    summary.consistency = 'Excellent';
  } else if (consistencyRate > 60) {
    summary.consistency = 'Good';
  } else if (consistencyRate > 40) {
    summary.consistency = 'Fair';
  } else {
    summary.consistency = 'Poor';
  }

  return summary;
}

/**
 * Generate member-specific insights
 */
function generateMemberInsights(recentUpdates, summary) {
  const insights = [];

  if (summary.productivity === 'High') {
    insights.push('Maintaining high productivity levels');
  } else if (summary.productivity === 'Low') {
    insights.push('Consider reviewing workload and removing blockers');
  }

  if (summary.consistency === 'Poor') {
    insights.push('Irregular standup participation - try to maintain daily updates');
  } else if (summary.consistency === 'Excellent') {
    insights.push('Excellent standup consistency');
  }

  if (summary.blockerFrequency > 50) {
    insights.push('High blocker frequency - may need additional support');
  } else if (summary.blockerFrequency === 0) {
    insights.push('No blockers reported - smooth workflow');
  }

  return insights;
}

/**
 * Analyze member trends over time
 */
function analyzeMemberTrends(recentUpdates) {
  if (recentUpdates.length < 3) {
    return { message: 'Not enough data for trend analysis' };
  }

  // Sort by date (oldest first for trend analysis)
  const sortedUpdates = [...recentUpdates].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp));

  const trends = {
    taskTrend: 'stable',
    prTrend: 'stable',
    blockerTrend: 'stable'
  };

  // Analyze task trend
  const recentTasks = sortedUpdates.slice(-3).map(u => u.jiraTasks?.length || 0);
  const earlierTasks = sortedUpdates.slice(0, 3).map(u => u.jiraTasks?.length || 0);
  
  const recentAvgTasks = recentTasks.reduce((sum, count) => sum + count, 0) / recentTasks.length;
  const earlierAvgTasks = earlierTasks.reduce((sum, count) => sum + count, 0) / earlierTasks.length;
  
  if (recentAvgTasks > earlierAvgTasks * 1.2) {
    trends.taskTrend = 'increasing';
  } else if (recentAvgTasks < earlierAvgTasks * 0.8) {
    trends.taskTrend = 'decreasing';
  }

  // Similar analysis for PRs and blockers...
  const recentPRs = sortedUpdates.slice(-3).map(u => u.bitbucketPRs?.length || 0);
  const earlierPRs = sortedUpdates.slice(0, 3).map(u => u.bitbucketPRs?.length || 0);
  
  const recentAvgPRs = recentPRs.reduce((sum, count) => sum + count, 0) / recentPRs.length;
  const earlierAvgPRs = earlierPRs.reduce((sum, count) => sum + count, 0) / earlierPRs.length;
  
  if (recentAvgPRs > earlierAvgPRs * 1.2) {
    trends.prTrend = 'increasing';
  } else if (recentAvgPRs < earlierAvgPRs * 0.8) {
    trends.prTrend = 'decreasing';
  }

  return trends;
}

/**
 * Analyze individual blockers
 */
function analyzeIndividualBlockers(teamMember, recentUpdates) {
  const blockers = recentUpdates
    .filter(update => update.blockers && update.blockers.toLowerCase() !== 'none')
    .map(update => ({
      date: update.timestamp,
      blocker: update.blockers,
      followUpQuestions: update.followUpQuestions || []
    }));

  const analysis = {
    teamMember,
    totalBlockers: blockers.length,
    blockerFrequency: recentUpdates.length > 0 ? Math.round((blockers.length / recentUpdates.length) * 100) : 0,
    recentBlockers: blockers.slice(0, 5),
    recurringBlockers: findRecurringBlockers(blockers),
    recommendations: generateBlockerRecommendations(blockers)
  };

  return analysis;
}

/**
 * Analyze team-wide blockers
 */
function analyzeTeamBlockers(teamMetrics) {
  return {
    scope: 'Team-wide',
    topBlockers: teamMetrics.topBlockers || [],
    totalMembers: teamMetrics.activeMembers || 0,
    recommendations: teamMetrics.topBlockers && teamMetrics.topBlockers.length > 0 
      ? ['Address recurring blockers', 'Implement blocker escalation process']
      : ['Team has minimal blockers - good workflow']
  };
}

/**
 * Find recurring blockers
 */
function findRecurringBlockers(blockers) {
  const blockerTexts = blockers.map(b => b.blocker.toLowerCase());
  const recurring = [];
  
  blockerTexts.forEach((blocker, index) => {
    const similarBlockers = blockerTexts.filter((other, otherIndex) => 
      otherIndex !== index && other.includes(blocker.substring(0, 20))
    );
    
    if (similarBlockers.length > 0) {
      recurring.push({
        blocker: blocker.substring(0, 100),
        occurrences: similarBlockers.length + 1
      });
    }
  });

  return recurring.slice(0, 3); // Top 3 recurring blockers
}

/**
 * Generate blocker recommendations
 */
function generateBlockerRecommendations(blockers) {
  const recommendations = [];

  if (blockers.length === 0) {
    recommendations.push('No recent blockers - workflow is smooth');
    return recommendations;
  }

  if (blockers.length > 5) {
    recommendations.push('High blocker frequency - consider process improvements');
  }

  const recentBlockers = blockers.slice(0, 3);
  if (recentBlockers.length > 0) {
    recommendations.push(`Address current blocker: ${recentBlockers[0].blocker.substring(0, 50)}...`);
  }

  recommendations.push('Schedule 1:1 to discuss blocker resolution strategies');

  return recommendations;
}

/**
 * Calculate individual productivity metrics
 */
function calculateIndividualProductivity(teamMember, history) {
  if (!history || history.length === 0) {
    return {
      teamMember,
      productivity: 'No data',
      metrics: {}
    };
  }

  const totalTasks = history.reduce((sum, entry) => sum + (entry.jiraTasks?.length || 0), 0);
  const totalPRs = history.reduce((sum, entry) => sum + (entry.bitbucketPRs?.length || 0), 0);
  const totalBlockers = history.filter(entry => 
    entry.blockers && entry.blockers.toLowerCase() !== 'none').length;

  return {
    teamMember,
    productivity: calculateProductivityScore(totalTasks, totalPRs, totalBlockers, history.length),
    metrics: {
      totalStandups: history.length,
      averageTasksPerStandup: Math.round((totalTasks / history.length) * 100) / 100,
      averagePRsPerStandup: Math.round((totalPRs / history.length) * 100) / 100,
      blockerRate: Math.round((totalBlockers / history.length) * 100)
    }
  };
}

/**
 * Calculate team productivity metrics
 */
function calculateTeamProductivity(teamMetrics) {
  return {
    scope: 'Team',
    productivity: teamMetrics.averageTasksPerMember > 5 ? 'High' : 
                 teamMetrics.averageTasksPerMember > 3 ? 'Medium' : 'Low',
    metrics: {
      totalMembers: teamMetrics.activeMembers,
      totalStandups: teamMetrics.totalStandups,
      averageTasksPerMember: teamMetrics.averageTasksPerMember,
      averagePRsPerMember: teamMetrics.averagePRsPerMember
    }
  };
}

/**
 * Calculate productivity score
 */
function calculateProductivityScore(tasks, prs, blockers, standups) {
  if (standups === 0) return 'No data';
  
  const taskScore = (tasks / standups) * 2;
  const prScore = (prs / standups) * 1.5;
  const blockerPenalty = (blockers / standups) * 2;
  
  const score = taskScore + prScore - blockerPenalty;
  
  if (score > 6) return 'High';
  if (score > 3) return 'Medium';
  return 'Low';
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
