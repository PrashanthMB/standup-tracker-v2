const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { getTeamMemberTasks } = require('../services/jiraService');
const { getPRStatus } = require('../services/bitbucketService');
const { saveStandupData, getPreviousUpdates } = require('../services/storageService');
const { generateFollowUpQuestions } = require('../services/aiService');

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1'
});

exports.processStandup = async (event, context) => {
  try {
    console.log('Processing standup request:', JSON.stringify(event, null, 2));
    
    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { teamMemberName, yesterday, today, blockers } = body;

    // Validate required fields
    if (!teamMemberName || !yesterday || !today || !blockers) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['teamMemberName', 'yesterday', 'today', 'blockers']
        })
      };
    }

    const standupData = {
      teamMemberName,
      yesterday,
      today,
      blockers,
      timestamp: new Date().toISOString(),
      id: require('uuid').v4()
    };

    console.log('Standup data prepared:', standupData);

    // Get previous updates for context awareness
    const previousUpdates = await getPreviousUpdates(teamMemberName);
    console.log(`Found ${previousUpdates.length} previous updates for ${teamMemberName}`);

    // Get Jira tasks and Bitbucket PRs in parallel
    const [jiraTasks, bitbucketPRs] = await Promise.allSettled([
      getTeamMemberTasks(teamMemberName),
      getPRStatus(teamMemberName)
    ]);

    const tasks = jiraTasks.status === 'fulfilled' ? jiraTasks.value : [];
    const prs = bitbucketPRs.status === 'fulfilled' ? bitbucketPRs.value : [];

    console.log(`Retrieved ${tasks.length} Jira tasks and ${prs.length} PRs`);

    // Generate AI-powered follow-up questions using Amazon Bedrock
    const followUpQuestions = await generateFollowUpQuestions({
      standupData,
      previousUpdates,
      tasks,
      prs
    });

    // Prepare complete standup record
    const completeStandupRecord = {
      ...standupData,
      jiraTasks: tasks,
      bitbucketPRs: prs,
      followUpQuestions,
      previousUpdatesCount: previousUpdates.length,
      analysisMetadata: {
        tasksAnalyzed: tasks.length,
      prsAnalyzed: prs.length,
        questionsGenerated: followUpQuestions.length,
        contextFromPreviousUpdates: previousUpdates.length > 0
      }
    };

    // Save to storage (JSON/CSV based on configuration)
    await saveStandupData(completeStandupRecord);
    console.log('Standup data saved successfully');

    // Return response for VS Code Copilot Chat integration
    const response = {
      success: true,
      message: `Standup processed successfully for ${teamMemberName}`,
      data: {
        standupId: standupData.id,
        teamMember: teamMemberName,
        timestamp: standupData.timestamp,
        summary: {
          yesterday: yesterday.substring(0, 100) + (yesterday.length > 100 ? '...' : ''),
          today: today.substring(0, 100) + (today.length > 100 ? '...' : ''),
          blockers: blockers.substring(0, 100) + (blockers.length > 100 ? '...' : ''),
          jiraTasksCount: tasks.length,
          openPRsCount: prs.filter(pr => pr.state === 'OPEN').length,
          followUpQuestionsCount: followUpQuestions.length
        },
        followUpQuestions,
        insights: await generateInsights(completeStandupRecord, previousUpdates)
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error processing standup:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Helper function to generate insights
async function generateInsights(currentStandup, previousUpdates) {
  const insights = [];

  // Analyze task completion patterns
  if (previousUpdates.length > 0) {
    const lastUpdate = previousUpdates[previousUpdates.length - 1];
    
    // Check for recurring blockers
    if (lastUpdate.blockers && currentStandup.blockers) {
      const currentBlockersLower = currentStandup.blockers.toLowerCase();
      const lastBlockersLower = lastUpdate.blockers.toLowerCase();
      
      if (currentBlockersLower.includes(lastBlockersLower.substring(0, 20)) || 
          lastBlockersLower.includes(currentBlockersLower.substring(0, 20))) {
        insights.push({
          type: 'recurring_blocker',
          message: 'Similar blockers detected from previous standup. Consider escalating or seeking additional help.',
          priority: 'high'
        });
      }
    }
  }

  // Analyze PR status
  const openPRs = currentStandup.bitbucketPRs.filter(pr => pr.state === 'OPEN');
  if (openPRs.length > 3) {
    insights.push({
      type: 'high_pr_count',
      message: `You have ${openPRs.length} open PRs. Consider prioritizing reviews and merges.`,
      priority: 'medium'
    });
  }

  // Check for PRs with many comments (indicating potential issues)
  const prsWithManyComments = openPRs.filter(pr => pr.comment_count && pr.comment_count > 10);
  if (prsWithManyComments.length > 0) {
    insights.push({
      type: 'pr_review_issues',
      message: `${prsWithManyComments.length} PR(s) have extensive review comments. These may need immediate attention.`,
      priority: 'high',
      details: prsWithManyComments.map(pr => ({
        title: pr.title,
        comments: pr.comment_count,
        url: pr.links?.html?.href
      }))
    });
  }

  return insights;
}
