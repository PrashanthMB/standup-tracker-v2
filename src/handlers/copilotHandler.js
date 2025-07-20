const { generateFollowUpQuestions, analyzeStandupPatterns } = require('../services/aiService');
const { getPreviousUpdates, getStandupHistory, getTeamMetrics } = require('../services/storageService');
const { getTeamMemberTasks } = require('../services/jiraService');
const { getPRStatus } = require('../services/bitbucketService');

/**
 * VS Code GitHub Copilot Chat Integration Handler
 * This handler processes chat interactions and provides intelligent responses
 * based on standup data, team metrics, and AI analysis
 */

exports.handleChatInteraction = async (event, context) => {
  try {
    console.log('Processing Copilot Chat interaction:', JSON.stringify(event, null, 2));
    
    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { 
      message, 
      teamMember, 
      context: chatContext, 
      conversationId,
      intent 
    } = body;

    if (!message) {
      return createErrorResponse(400, 'Message is required');
    }

    console.log(`Processing chat message: "${message}" for team member: ${teamMember}`);

    // Determine the intent of the message if not provided
    const detectedIntent = intent || await detectIntent(message);
    console.log(`Detected intent: ${detectedIntent}`);

    let response;

    switch (detectedIntent) {
      case 'standup_status':
        response = await handleStandupStatusQuery(teamMember, message);
        break;
      case 'team_metrics':
        response = await handleTeamMetricsQuery(message);
        break;
      case 'task_status':
        response = await handleTaskStatusQuery(teamMember, message);
        break;
      case 'pr_status':
        response = await handlePRStatusQuery(teamMember, message);
        break;
      case 'blocker_help':
        response = await handleBlockerHelpQuery(teamMember, message);
        break;
      case 'history_query':
        response = await handleHistoryQuery(teamMember, message);
        break;
      case 'general_help':
        response = await handleGeneralHelpQuery(message);
        break;
      default:
        response = await handleGeneralQuery(teamMember, message, chatContext);
    }

    // Add conversation context
    response.conversationId = conversationId || require('uuid').v4();
    response.timestamp = new Date().toISOString();
    response.intent = detectedIntent;

    return createSuccessResponse(response);

  } catch (error) {
    console.error('Error processing Copilot Chat interaction:', error);
    return createErrorResponse(500, 'Failed to process chat interaction', error.message);
  }
};

/**
 * Detect the intent of the user's message
 */
async function detectIntent(message) {
  const messageLower = message.toLowerCase();
  
  // Simple intent detection based on keywords
  if (messageLower.includes('standup') || messageLower.includes('update') || messageLower.includes('status')) {
    return 'standup_status';
  }
  
  if (messageLower.includes('team') || messageLower.includes('metrics') || messageLower.includes('statistics')) {
    return 'team_metrics';
  }
  
  if (messageLower.includes('task') || messageLower.includes('jira') || messageLower.includes('ticket')) {
    return 'task_status';
  }
  
  if (messageLower.includes('pr') || messageLower.includes('pull request') || messageLower.includes('merge')) {
    return 'pr_status';
  }
  
  if (messageLower.includes('blocker') || messageLower.includes('blocked') || messageLower.includes('help')) {
    return 'blocker_help';
  }
  
  if (messageLower.includes('history') || messageLower.includes('previous') || messageLower.includes('past')) {
    return 'history_query';
  }
  
  if (messageLower.includes('help') || messageLower.includes('how') || messageLower.includes('what')) {
    return 'general_help';
  }
  
  return 'general_query';
}

/**
 * Handle standup status queries
 */
async function handleStandupStatusQuery(teamMember, message) {
  try {
    if (!teamMember) {
      return {
        message: "I need to know which team member you're asking about. Please specify a team member name.",
        type: 'info',
        suggestions: [
          "What's John's latest standup status?",
          "Show me Sarah's current tasks",
          "How is the team doing today?"
        ]
      };
    }

    const [previousUpdates, tasks, prs] = await Promise.allSettled([
      getPreviousUpdates(teamMember, 3),
      getTeamMemberTasks(teamMember),
      getPRStatus(teamMember)
    ]);

    const recentUpdates = previousUpdates.status === 'fulfilled' ? previousUpdates.value : [];
    const currentTasks = tasks.status === 'fulfilled' ? tasks.value : [];
    const currentPRs = prs.status === 'fulfilled' ? prs.value : [];

    if (recentUpdates.length === 0) {
      return {
        message: `No recent standup updates found for ${teamMember}. They may not have submitted a standup recently.`,
        type: 'info',
        data: {
          teamMember,
          tasks: currentTasks.length,
          prs: currentPRs.length
        }
      };
    }

    const latestUpdate = recentUpdates[0];
    const openPRs = currentPRs.filter(pr => pr.state === 'OPEN');
    const inProgressTasks = currentTasks.filter(task => 
      task.status.category === 'In Progress' || task.status.name.toLowerCase().includes('progress')
    );

    return {
      message: `Here's ${teamMember}'s latest standup status:`,
      type: 'standup_summary',
      data: {
        teamMember,
        lastUpdate: latestUpdate.timestamp,
        summary: {
          yesterday: latestUpdate.yesterday,
          today: latestUpdate.today,
          blockers: latestUpdate.blockers
        },
        currentWork: {
          activeTasks: inProgressTasks.length,
          totalTasks: currentTasks.length,
          openPRs: openPRs.length,
          totalPRs: currentPRs.length
        },
        insights: [
          `${inProgressTasks.length} tasks currently in progress`,
          `${openPRs.length} pull requests awaiting review/merge`,
          latestUpdate.blockers && latestUpdate.blockers.toLowerCase() !== 'none' 
            ? `Has blockers: ${latestUpdate.blockers.substring(0, 100)}...`
            : 'No current blockers reported'
        ]
      },
      suggestions: [
        `What are ${teamMember}'s current blockers?`,
        `Show me ${teamMember}'s PR status`,
        `How can we help ${teamMember}?`
      ]
    };

  } catch (error) {
    console.error('Error handling standup status query:', error);
    return {
      message: `Sorry, I encountered an error while fetching standup status for ${teamMember}.`,
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle team metrics queries
 */
async function handleTeamMetricsQuery(message) {
  try {
    const metrics = await getTeamMetrics();
    
    if (metrics.totalStandups === 0) {
      return {
        message: "No team standup data available yet. Team members need to submit their standups first.",
        type: 'info',
        suggestions: [
          "How do I submit a standup?",
          "What information should be included in a standup?",
          "Show me the standup format"
        ]
      };
    }

    const insights = [];
    
    if (metrics.averageTasksPerMember > 5) {
      insights.push("⚠️ Team members have a high task load on average");
    }
    
    if (metrics.averagePRsPerMember > 3) {
      insights.push("📋 Many open PRs - consider prioritizing reviews");
    }
    
    if (metrics.topBlockers.length > 0) {
      insights.push(`🚫 Most common blocker: ${metrics.topBlockers[0].blocker}`);
    }

    return {
      message: "Here are the current team metrics:",
      type: 'team_metrics',
      data: {
        overview: {
          totalStandups: metrics.totalStandups,
          activeMembers: metrics.activeMembers,
          averageTasksPerMember: metrics.averageTasksPerMember,
          averagePRsPerMember: metrics.averagePRsPerMember
        },
        topBlockers: metrics.topBlockers.slice(0, 3),
        insights,
        memberStats: Object.keys(metrics.memberStats || {}).length > 0 ? 
          Object.entries(metrics.memberStats).slice(0, 5).map(([member, stats]) => ({
            member,
            standupCount: stats.standupCount,
            avgTasks: Math.round(stats.totalTasks / stats.standupCount),
            avgPRs: Math.round(stats.totalPRs / stats.standupCount)
          })) : []
      },
      suggestions: [
        "Who needs help with their workload?",
        "What are the most common blockers?",
        "Show me individual team member status"
      ]
    };

  } catch (error) {
    console.error('Error handling team metrics query:', error);
    return {
      message: "Sorry, I encountered an error while fetching team metrics.",
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle task status queries
 */
async function handleTaskStatusQuery(teamMember, message) {
  try {
    if (!teamMember) {
      return {
        message: "Please specify which team member's tasks you'd like to see.",
        type: 'info'
      };
    }

    const tasks = await getTeamMemberTasks(teamMember);
    
    if (tasks.length === 0) {
      return {
        message: `No tasks found for ${teamMember} in Jira. They may not have any assigned tasks or Jira integration may not be configured.`,
        type: 'info'
      };
    }

    const tasksByStatus = tasks.reduce((acc, task) => {
      const status = task.status.name;
      if (!acc[status]) acc[status] = [];
      acc[status].push(task);
      return acc;
    }, {});

    const highPriorityTasks = tasks.filter(task => 
      task.priority.name === 'High' || task.priority.name === 'Highest'
    );

    return {
      message: `Here are ${teamMember}'s current tasks:`,
      type: 'task_status',
      data: {
        teamMember,
        totalTasks: tasks.length,
        tasksByStatus,
        highPriorityTasks: highPriorityTasks.length,
        recentTasks: tasks.slice(0, 5).map(task => ({
          key: task.key,
          summary: task.summary,
          status: task.status.name,
          priority: task.priority.name,
          url: task.url
        }))
      },
      suggestions: [
        `What are ${teamMember}'s high priority tasks?`,
        `Show me ${teamMember}'s task progress`,
        `Are there any overdue tasks?`
      ]
    };

  } catch (error) {
    console.error('Error handling task status query:', error);
    return {
      message: `Sorry, I encountered an error while fetching task status for ${teamMember}.`,
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle PR status queries
 */
async function handlePRStatusQuery(teamMember, message) {
  try {
    if (!teamMember) {
      return {
        message: "Please specify which team member's PRs you'd like to see.",
        type: 'info'
      };
    }

    const prs = await getPRStatus(teamMember);
    
    if (prs.length === 0) {
      return {
        message: `No pull requests found for ${teamMember}. They may not have any PRs or Bitbucket integration may not be configured.`,
        type: 'info'
      };
    }

    const openPRs = prs.filter(pr => pr.state === 'OPEN');
    const stalePRs = openPRs.filter(pr => pr.isStale);
    const needsReview = openPRs.filter(pr => pr.needsReview);
    const highCommentPRs = openPRs.filter(pr => pr.commentCount > 5);

    const insights = [];
    if (stalePRs.length > 0) {
      insights.push(`${stalePRs.length} PRs haven't been updated in over a week`);
    }
    if (needsReview.length > 0) {
      insights.push(`${needsReview.length} PRs are waiting for review`);
    }
    if (highCommentPRs.length > 0) {
      insights.push(`${highCommentPRs.length} PRs have extensive review comments`);
    }

    return {
      message: `Here's ${teamMember}'s PR status:`,
      type: 'pr_status',
      data: {
        teamMember,
        totalPRs: prs.length,
        openPRs: openPRs.length,
        stalePRs: stalePRs.length,
        needsReview: needsReview.length,
        insights,
        recentPRs: prs.slice(0, 5).map(pr => ({
          id: pr.id,
          title: pr.title,
          state: pr.state,
          commentCount: pr.commentCount,
          daysSinceUpdated: pr.daysSinceUpdated,
          needsReview: pr.needsReview,
          isStale: pr.isStale,
          url: pr.links.html
        }))
      },
      suggestions: [
        `Which PRs need immediate attention?`,
        `Why does ${teamMember} have so many PR comments?`,
        `When will these PRs be merged?`
      ]
    };

  } catch (error) {
    console.error('Error handling PR status query:', error);
    return {
      message: `Sorry, I encountered an error while fetching PR status for ${teamMember}.`,
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle blocker help queries
 */
async function handleBlockerHelpQuery(teamMember, message) {
  try {
    if (!teamMember) {
      return {
        message: "Please specify which team member needs help with blockers.",
        type: 'info'
      };
    }

    const recentUpdates = await getPreviousUpdates(teamMember, 5);
    
    if (recentUpdates.length === 0) {
      return {
        message: `No recent standup data found for ${teamMember} to analyze blockers.`,
        type: 'info'
      };
    }

    // Analyze recent blockers
    const recentBlockers = recentUpdates
      .filter(update => update.blockers && update.blockers.toLowerCase() !== 'none')
      .map(update => ({
        date: update.timestamp,
        blocker: update.blocker,
        followUpQuestions: update.followUpQuestions || []
      }));

    if (recentBlockers.length === 0) {
      return {
        message: `Great news! ${teamMember} hasn't reported any blockers in their recent standups.`,
        type: 'positive',
        suggestions: [
          `What is ${teamMember} working on today?`,
          `Show me ${teamMember}'s current tasks`,
          `How is ${teamMember}'s progress?`
        ]
      };
    }

    // Check for recurring blockers
    const blockerTexts = recentBlockers.map(b => b.blocker.toLowerCase());
    const recurringBlockers = blockerTexts.filter((blocker, index) => 
      blockerTexts.indexOf(blocker) !== index
    );

    const suggestions = [
      "Schedule a 1:1 to discuss blockers in detail",
      "Identify if additional resources or expertise are needed",
      "Consider escalating to management if blockers persist",
      "Pair programming or knowledge sharing session might help"
    ];

    return {
      message: `Here's the blocker analysis for ${teamMember}:`,
      type: 'blocker_analysis',
      data: {
        teamMember,
        recentBlockers: recentBlockers.slice(0, 3),
        hasRecurringBlockers: recurringBlockers.length > 0,
        blockerCount: recentBlockers.length,
        suggestions: suggestions.slice(0, 3),
        actionItems: [
          `Follow up on: ${recentBlockers[0].blocker.substring(0, 100)}...`,
          "Check if blocker is still active",
          "Identify who can help resolve this blocker"
        ]
      },
      suggestions: [
        `How can we help resolve ${teamMember}'s blockers?`,
        `Who else can assist with this issue?`,
        `What resources does ${teamMember} need?`
      ]
    };

  } catch (error) {
    console.error('Error handling blocker help query:', error);
    return {
      message: `Sorry, I encountered an error while analyzing blockers for ${teamMember}.`,
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle history queries
 */
async function handleHistoryQuery(teamMember, message) {
  try {
    if (!teamMember) {
      return {
        message: "Please specify which team member's history you'd like to see.",
        type: 'info'
      };
    }

    const history = await getStandupHistory(teamMember);
    
    if (history.length === 0) {
      return {
        message: `No standup history found for ${teamMember}.`,
        type: 'info'
      };
    }

    // Analyze patterns in the history
    const patterns = await analyzeStandupPatterns(teamMember, history[0], history);

    return {
      message: `Here's ${teamMember}'s standup history and patterns:`,
      type: 'history_analysis',
      data: {
        teamMember,
        totalEntries: history.length,
        dateRange: {
          from: history[history.length - 1].timestamp,
          to: history[0].timestamp
        },
        patterns,
        recentEntries: history.slice(0, 3).map(entry => ({
          date: entry.timestamp,
          yesterday: entry.yesterday.substring(0, 100) + '...',
          today: entry.today.substring(0, 100) + '...',
          blockers: entry.blockers
        }))
      },
      suggestions: [
        `What trends do you see in ${teamMember}'s work?`,
        `Are there recurring patterns in blockers?`,
        `How has ${teamMember}'s productivity changed?`
      ]
    };

  } catch (error) {
    console.error('Error handling history query:', error);
    return {
      message: `Sorry, I encountered an error while fetching history for ${teamMember}.`,
      type: 'error',
      error: error.message
    };
  }
}

/**
 * Handle general help queries
 */
async function handleGeneralHelpQuery(message) {
  return {
    message: "I'm your AI-powered standup assistant! Here's what I can help you with:",
    type: 'help',
    data: {
      capabilities: [
        "📊 Track and analyze daily standup updates",
        "🎯 Monitor team member tasks from Jira",
        "🔄 Check pull request status from Bitbucket",
        "🤖 Generate intelligent follow-up questions",
        "📈 Provide team metrics and insights",
        "🚫 Identify and track blockers",
        "📋 Analyze work patterns and trends"
      ],
      commands: [
        "Ask about team member status: 'What's John's standup status?'",
        "Get team metrics: 'Show me team statistics'",
        "Check task status: 'What are Sarah's current tasks?'",
        "Review PR status: 'How are Mike's pull requests?'",
        "Analyze blockers: 'Help with blockers for Alice'",
        "View history: 'Show me Bob's standup history'"
      ]
    },
    suggestions: [
      "What's the team's current status?",
      "Who needs help with their workload?",
      "Show me today's standup summary"
    ]
  };
}

/**
 * Handle general queries with AI assistance
 */
async function handleGeneralQuery(teamMember, message, chatContext) {
  try {
    // Use AI to generate a contextual response
    const followUpQuestions = await generateFollowUpQuestions({
      standupData: { teamMemberName: teamMember, yesterday: '', today: message, blockers: '' },
      previousUpdates: [],
      tasks: [],
      prs: []
    });

    return {
      message: `I understand you're asking about: "${message}". Let me help you with that.`,
      type: 'general_response',
      data: {
        originalQuery: message,
        teamMember,
        context: chatContext,
        suggestions: followUpQuestions.slice(0, 3)
      },
      suggestions: [
        "Can you be more specific about what you need?",
        "Would you like me to check someone's status?",
        "Do you need help with team metrics?"
      ]
    };

  } catch (error) {
    console.error('Error handling general query:', error);
    return {
      message: "I'm not sure how to help with that specific request. Could you please rephrase or ask about standup status, team metrics, tasks, or PRs?",
      type: 'clarification',
      suggestions: [
        "Show me team status",
        "What are the current blockers?",
        "Help me understand the standup process"
      ]
    };
  }
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
    body: JSON.stringify({
      success: true,
      ...data
    })
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
