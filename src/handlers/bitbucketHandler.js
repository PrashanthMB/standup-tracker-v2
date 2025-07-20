const { getPRStatus, getRepositoryPRs, getPRDetails, getTeamMemberPRActivity, getRepositoryStats, getTeamPRWorkload, getWorkspaceRepositories } = require('../services/bitbucketService');

/**
 * Bitbucket Integration Handler
 * Provides endpoints for PR management, repository analysis, and team collaboration insights
 */

exports.getPRStatus = async (event, context) => {
  try {
    console.log('Fetching Bitbucket PR status:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching PR status for: ${teamMember}`);
    
    const prs = await getPRStatus(teamMember);
    
    // Analyze PRs for insights
    const prAnalysis = analyzePRs(prs);
    
    const response = {
      success: true,
      teamMember,
      timestamp: new Date().toISOString(),
      data: {
        prs,
        analysis: prAnalysis,
        summary: {
          totalPRs: prs.length,
          openPRs: prs.filter(pr => pr.state === 'OPEN').length,
          mergedPRs: prs.filter(pr => pr.state === 'MERGED').length,
          declinedPRs: prs.filter(pr => pr.state === 'DECLINED').length,
          stalePRs: prs.filter(pr => pr.isStale).length,
          needsReview: prs.filter(pr => pr.needsReview).length,
          averageComments: prs.length > 0 ? Math.round(prs.reduce((sum, pr) => sum + pr.commentCount, 0) / prs.length) : 0
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching Bitbucket PR status:', error);
    return createErrorResponse(500, 'Failed to fetch PR status', error.message);
  }
};

exports.getRepositoryPRs = async (event, context) => {
  try {
    console.log('Fetching repository PRs:', JSON.stringify(event, null, 2));
    
    const repositoryName = event.pathParameters?.repositoryName;
    const authorName = event.queryStringParameters?.author;
    
    if (!repositoryName) {
      return createErrorResponse(400, 'Repository name is required');
    }

    console.log(`Fetching PRs for repository: ${repositoryName}${authorName ? ` by author: ${authorName}` : ''}`);
    
    const prs = await getRepositoryPRs(repositoryName, authorName);
    
    // Analyze repository PR patterns
    const repoAnalysis = analyzeRepositoryPRs(prs);
    
    const response = {
      success: true,
      repositoryName,
      authorName,
      timestamp: new Date().toISOString(),
      data: {
        prs,
        analysis: repoAnalysis,
        summary: {
          totalPRs: prs.length,
          openPRs: prs.filter(pr => pr.state === 'OPEN').length,
          mergedPRs: prs.filter(pr => pr.state === 'MERGED').length,
          averageDaysOpen: calculateAverageDaysOpen(prs.filter(pr => pr.state === 'OPEN')),
          topContributors: getTopContributors(prs)
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching repository PRs:', error);
    return createErrorResponse(500, 'Failed to fetch repository PRs', error.message);
  }
};

exports.getPRDetails = async (event, context) => {
  try {
    console.log('Fetching PR details:', JSON.stringify(event, null, 2));
    
    const repositoryName = event.pathParameters?.repositoryName;
    const prId = event.pathParameters?.prId;
    
    if (!repositoryName || !prId) {
      return createErrorResponse(400, 'Repository name and PR ID are required');
    }

    console.log(`Fetching details for PR ${prId} in repository: ${repositoryName}`);
    
    const prDetails = await getPRDetails(repositoryName, prId);
    
    if (!prDetails) {
      return createErrorResponse(404, `PR ${prId} not found in repository ${repositoryName}`);
    }

    const response = {
      success: true,
      repositoryName,
      prId,
      timestamp: new Date().toISOString(),
      data: prDetails
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching PR details:', error);
    return createErrorResponse(500, 'Failed to fetch PR details', error.message);
  }
};

exports.getTeamMemberPRActivity = async (event, context) => {
  try {
    console.log('Fetching team member PR activity:', JSON.stringify(event, null, 2));
    
    const teamMember = event.pathParameters?.teamMember;
    const days = parseInt(event.queryStringParameters?.days) || 7;
    
    if (!teamMember) {
      return createErrorResponse(400, 'Team member name is required');
    }

    console.log(`Fetching ${days} days of PR activity for: ${teamMember}`);
    
    const activity = await getTeamMemberPRActivity(teamMember, days);
    
    const response = {
      success: true,
      teamMember,
      days,
      timestamp: new Date().toISOString(),
      data: {
        activity,
        summary: {
          createdPRs: activity.createdPRs.length,
          reviewedPRs: activity.reviewedPRs.length,
          mergedPRs: activity.mergedPRs.length,
          totalActivity: activity.totalActivity
        },
        insights: generateActivityInsights(activity, days)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching team member PR activity:', error);
    return createErrorResponse(500, 'Failed to fetch PR activity', error.message);
  }
};

exports.getRepositoryStats = async (event, context) => {
  try {
    console.log('Fetching repository statistics:', JSON.stringify(event, null, 2));
    
    const repositoryName = event.pathParameters?.repositoryName;
    
    if (!repositoryName) {
      return createErrorResponse(400, 'Repository name is required');
    }

    console.log(`Fetching statistics for repository: ${repositoryName}`);
    
    const repoStats = await getRepositoryStats(repositoryName);
    
    if (!repoStats) {
      return createErrorResponse(404, `Repository ${repositoryName} not found`);
    }

    const response = {
      success: true,
      repositoryName,
      timestamp: new Date().toISOString(),
      data: {
        ...repoStats,
        healthScore: calculateRepositoryHealthScore(repoStats),
        recommendations: generateRepositoryRecommendations(repoStats)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching repository statistics:', error);
    return createErrorResponse(500, 'Failed to fetch repository statistics', error.message);
  }
};

exports.getTeamPRWorkload = async (event, context) => {
  try {
    console.log('Calculating team PR workload:', JSON.stringify(event, null, 2));
    
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { teamMembers } = body;
    
    if (!teamMembers || !Array.isArray(teamMembers) || teamMembers.length === 0) {
      return createErrorResponse(400, 'Team members array is required');
    }

    console.log(`Calculating PR workload for team members: ${teamMembers.join(', ')}`);
    
    const workload = await getTeamPRWorkload(teamMembers);
    
    // Calculate team statistics
    const teamStats = calculateTeamPRStats(workload);
    
    const response = {
      success: true,
      teamMembers,
      timestamp: new Date().toISOString(),
      data: {
        workload,
        teamStats,
        insights: generatePRWorkloadInsights(workload),
        recommendations: generateTeamRecommendations(workload)
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error calculating team PR workload:', error);
    return createErrorResponse(500, 'Failed to calculate team PR workload', error.message);
  }
};

exports.getWorkspaceRepositories = async (event, context) => {
  try {
    console.log('Fetching workspace repositories:', JSON.stringify(event, null, 2));
    
    const repositories = await getWorkspaceRepositories();
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        repositories,
        summary: {
          totalRepositories: repositories.length,
          privateRepositories: repositories.filter(repo => repo.isPrivate).length,
          publicRepositories: repositories.filter(repo => !repo.isPrivate).length,
          languages: [...new Set(repositories.map(repo => repo.language).filter(Boolean))],
          recentlyUpdated: repositories.filter(repo => {
            const updatedDate = new Date(repo.updatedOn);
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return updatedDate > oneWeekAgo;
          }).length
        }
      }
    };

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error fetching workspace repositories:', error);
    return createErrorResponse(500, 'Failed to fetch workspace repositories', error.message);
  }
};

/**
 * Analyze PRs to provide insights
 */
function analyzePRs(prs) {
  if (!prs || prs.length === 0) {
    return {
      stalePRs: [],
      highCommentPRs: [],
      longRunningPRs: [],
      recommendations: ['No PRs found for analysis']
    };
  }

  const openPRs = prs.filter(pr => pr.state === 'OPEN');
  
  // Find stale PRs (not updated in over a week)
  const stalePRs = openPRs.filter(pr => pr.isStale);
  
  // Find PRs with many comments (potential issues)
  const highCommentPRs = openPRs.filter(pr => pr.commentCount > 10);
  
  // Find long-running PRs (open for more than 2 weeks)
  const longRunningPRs = openPRs.filter(pr => pr.daysSinceCreated > 14);
  
  // Generate recommendations
  const recommendations = [];
  
  if (stalePRs.length > 0) {
    recommendations.push(`${stalePRs.length} stale PRs need attention - consider updating or closing`);
  }
  
  if (highCommentPRs.length > 0) {
    recommendations.push(`${highCommentPRs.length} PRs have extensive review comments - may need direct discussion`);
  }
  
  if (longRunningPRs.length > 0) {
    recommendations.push(`${longRunningPRs.length} PRs have been open for over 2 weeks - consider breaking into smaller PRs`);
  }
  
  const needsReview = openPRs.filter(pr => pr.needsReview);
  if (needsReview.length > 0) {
    recommendations.push(`${needsReview.length} PRs are waiting for initial review`);
  }

  if (recommendations.length === 0) {
    recommendations.push('PR status looks healthy');
  }

  return {
    stalePRs: stalePRs.map(pr => ({
      id: pr.id,
      title: pr.title,
      daysSinceUpdated: pr.daysSinceUpdated,
      url: pr.links.html
    })),
    highCommentPRs: highCommentPRs.map(pr => ({
      id: pr.id,
      title: pr.title,
      commentCount: pr.commentCount,
      url: pr.links.html
    })),
    longRunningPRs: longRunningPRs.map(pr => ({
      id: pr.id,
      title: pr.title,
      daysSinceCreated: pr.daysSinceCreated,
      url: pr.links.html
    })),
    recommendations
  };
}

/**
 * Analyze repository PR patterns
 */
function analyzeRepositoryPRs(prs) {
  if (!prs || prs.length === 0) {
    return {
      mergeRate: 0,
      averageTimeToMerge: 0,
      reviewEfficiency: 'N/A',
      collaborationScore: 0
    };
  }

  const mergedPRs = prs.filter(pr => pr.state === 'MERGED');
  const mergeRate = Math.round((mergedPRs.length / prs.length) * 100);
  
  // Calculate average time to merge for merged PRs
  const mergeTimesInDays = mergedPRs
    .filter(pr => pr.mergedOn)
    .map(pr => {
      const created = new Date(pr.createdOn);
      const merged = new Date(pr.mergedOn);
      return Math.floor((merged - created) / (1000 * 60 * 60 * 24));
    });
  
  const averageTimeToMerge = mergeTimesInDays.length > 0 
    ? Math.round(mergeTimesInDays.reduce((sum, days) => sum + days, 0) / mergeTimesInDays.length)
    : 0;
  
  // Calculate review efficiency (PRs with quick approvals)
  const quicklyApprovedPRs = prs.filter(pr => 
    pr.approvalCount > 0 && pr.commentCount < 5
  );
  const reviewEfficiency = prs.length > 0 
    ? Math.round((quicklyApprovedPRs.length / prs.length) * 100) + '%'
    : 'N/A';
  
  // Calculate collaboration score based on participation
  const totalParticipants = prs.reduce((sum, pr) => sum + pr.participants.length, 0);
  const collaborationScore = prs.length > 0 
    ? Math.round((totalParticipants / prs.length) * 10) / 10
    : 0;

  return {
    mergeRate,
    averageTimeToMerge,
    reviewEfficiency,
    collaborationScore
  };
}

/**
 * Calculate average days open for PRs
 */
function calculateAverageDaysOpen(openPRs) {
  if (openPRs.length === 0) return 0;
  
  const totalDays = openPRs.reduce((sum, pr) => sum + pr.daysSinceCreated, 0);
  return Math.round(totalDays / openPRs.length);
}

/**
 * Get top contributors from PRs
 */
function getTopContributors(prs) {
  const contributors = {};
  
  prs.forEach(pr => {
    const author = pr.author.username;
    if (!contributors[author]) {
      contributors[author] = {
        username: author,
        displayName: pr.author.displayName,
        prCount: 0,
        mergedCount: 0
      };
    }
    contributors[author].prCount++;
    if (pr.state === 'MERGED') {
      contributors[author].mergedCount++;
    }
  });
  
  return Object.values(contributors)
    .sort((a, b) => b.prCount - a.prCount)
    .slice(0, 5);
}

/**
 * Generate activity insights
 */
function generateActivityInsights(activity, days) {
  const insights = [];
  
  if (activity.createdPRs.length > 0) {
    insights.push(`Created ${activity.createdPRs.length} PRs in the last ${days} days`);
  }
  
  if (activity.reviewedPRs.length > 0) {
    insights.push(`Reviewed ${activity.reviewedPRs.length} PRs - good collaboration`);
  }
  
  if (activity.mergedPRs.length > 0) {
    insights.push(`${activity.mergedPRs.length} PRs merged - productive week`);
  }
  
  if (activity.totalActivity === 0) {
    insights.push(`No PR activity in the last ${days} days`);
  } else if (activity.totalActivity > 10) {
    insights.push('High PR activity - very engaged in code reviews');
  }
  
  return insights;
}

/**
 * Calculate repository health score
 */
function calculateRepositoryHealthScore(repoStats) {
  let score = 100;
  
  // Deduct points for stale PRs
  if (repoStats.statistics.stalePRs > 5) {
    score -= 20;
  } else if (repoStats.statistics.stalePRs > 2) {
    score -= 10;
  }
  
  // Deduct points for high average PR age
  if (repoStats.statistics.averagePRAge > 14) {
    score -= 15;
  } else if (repoStats.statistics.averagePRAge > 7) {
    score -= 5;
  }
  
  // Add points for good merge rate
  const mergeRate = repoStats.statistics.mergedPRs / (repoStats.statistics.totalPRs || 1);
  if (mergeRate > 0.8) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate repository recommendations
 */
function generateRepositoryRecommendations(repoStats) {
  const recommendations = [];
  
  if (repoStats.statistics.stalePRs > 3) {
    recommendations.push('Review and update stale PRs to maintain code quality');
  }
  
  if (repoStats.statistics.averagePRAge > 10) {
    recommendations.push('Consider implementing faster review cycles');
  }
  
  if (repoStats.statistics.openPRs > 10) {
    recommendations.push('High number of open PRs - consider prioritizing reviews');
  }
  
  const mergeRate = repoStats.statistics.mergedPRs / (repoStats.statistics.totalPRs || 1);
  if (mergeRate < 0.6) {
    recommendations.push('Low merge rate - review PR approval process');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Repository health looks good');
  }
  
  return recommendations;
}

/**
 * Calculate team PR statistics
 */
function calculateTeamPRStats(workload) {
  const members = Object.keys(workload);
  
  if (members.length === 0) {
    return {
      totalMembers: 0,
      totalPRs: 0,
      averagePRsPerMember: 0,
      totalOpenPRs: 0,
      reviewBalance: 'N/A'
    };
  }

  const totalPRs = members.reduce((sum, member) => sum + workload[member].totalPRs, 0);
  const totalOpenPRs = members.reduce((sum, member) => sum + workload[member].openPRs, 0);
  const averagePRsPerMember = Math.round(totalPRs / members.length * 100) / 100;
  
  // Calculate review balance
  const needsReviewCounts = members.map(member => workload[member].needsReview);
  const maxNeedsReview = Math.max(...needsReviewCounts);
  const minNeedsReview = Math.min(...needsReviewCounts);
  
  let reviewBalance = 'Balanced';
  if (maxNeedsReview - minNeedsReview > 3) {
    reviewBalance = 'Unbalanced';
  }

  return {
    totalMembers: members.length,
    totalPRs,
    averagePRsPerMember,
    totalOpenPRs,
    reviewBalance
  };
}

/**
 * Generate PR workload insights
 */
function generatePRWorkloadInsights(workload) {
  const insights = [];
  const members = Object.keys(workload);
  
  if (members.length === 0) {
    return ['No workload data available'];
  }

  // Find members with many stale PRs
  const staleMembers = members.filter(member => workload[member].stalePRs > 2);
  if (staleMembers.length > 0) {
    insights.push(`Members with stale PRs: ${staleMembers.join(', ')}`);
  }

  // Find members with many PRs needing review
  const reviewMembers = members.filter(member => workload[member].needsReview > 3);
  if (reviewMembers.length > 0) {
    insights.push(`Members with PRs needing review: ${reviewMembers.join(', ')}`);
  }

  // Find highly active members
  const activePRCounts = members.map(member => workload[member].totalPRs);
  const averagePRs = activePRCounts.reduce((sum, count) => sum + count, 0) / members.length;
  const highlyActive = members.filter(member => workload[member].totalPRs > averagePRs * 1.5);
  
  if (highlyActive.length > 0) {
    insights.push(`Highly active members: ${highlyActive.join(', ')}`);
  }

  if (insights.length === 0) {
    insights.push('Team PR workload appears balanced');
  }

  return insights;
}

/**
 * Generate team recommendations
 */
function generateTeamRecommendations(workload) {
  const recommendations = [];
  const members = Object.keys(workload);
  
  // Check for review bottlenecks
  const totalNeedsReview = members.reduce((sum, member) => sum + workload[member].needsReview, 0);
  if (totalNeedsReview > members.length * 2) {
    recommendations.push('Consider implementing pair reviews or review rotation');
  }

  // Check for stale PR issues
  const totalStalePRs = members.reduce((sum, member) => sum + workload[member].stalePRs, 0);
  if (totalStalePRs > members.length) {
    recommendations.push('Schedule regular PR cleanup sessions');
  }

  // Check for workload balance
  const prCounts = members.map(member => workload[member].totalPRs);
  const maxPRs = Math.max(...prCounts);
  const minPRs = Math.min(...prCounts);
  
  if (maxPRs - minPRs > 5) {
    recommendations.push('Consider redistributing PR workload more evenly');
  }

  if (recommendations.length === 0) {
    recommendations.push('Team PR management is working well');
  }

  return recommendations;
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
