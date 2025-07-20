const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1'
});

/**
 * Generate follow-up questions using Amazon Bedrock Claude model
 */
async function generateFollowUpQuestions({ standupData, previousUpdates, tasks, prs }) {
  try {
    console.log('Generating follow-up questions with AI...');

    // Prepare context for Claude
    const context = buildContextForAI(standupData, previousUpdates, tasks, prs);
    
    const prompt = `You are an AI assistant helping with daily standup meetings. Based on the following information, generate 3-5 intelligent follow-up questions that a scrum master or team lead would ask.

Context:
${context}

Focus on:
1. Incomplete or delayed tasks
2. Unmerged PRs with many comments
3. Recurring blockers
4. Dependencies between team members
5. Risk identification
6. Progress tracking

Generate questions that are:
- Specific and actionable
- Professional and supportive
- Focused on removing blockers
- Aimed at improving team productivity

Return only the questions as a JSON array of strings, no additional text.`;

    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const input = {
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        top_p: 0.9
      })
    };

    console.log('Invoking Bedrock model:', modelId);
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    console.log('Bedrock response received');

    // Extract questions from Claude's response
    let questions = [];
    try {
      const content = responseBody.content[0].text;
      
      // Try to parse as JSON first
      try {
        questions = JSON.parse(content);
      } catch (parseError) {
        // If not JSON, extract questions manually
        questions = extractQuestionsFromText(content);
      }
      
      // Ensure we have valid questions
      if (!Array.isArray(questions) || questions.length === 0) {
        questions = generateFallbackQuestions(standupData, tasks, prs);
      }
      
    } catch (extractError) {
      console.warn('Error extracting questions from AI response:', extractError);
      questions = generateFallbackQuestions(standupData, tasks, prs);
    }

    console.log(`Generated ${questions.length} follow-up questions`);
    return questions.slice(0, 5); // Limit to 5 questions

  } catch (error) {
    console.error('Error generating follow-up questions with Bedrock:', error);
    
    // Return fallback questions if AI fails
    return generateFallbackQuestions(standupData, tasks, prs);
  }
}

/**
 * Build context string for AI analysis
 */
function buildContextForAI(standupData, previousUpdates, tasks, prs) {
  let context = `Team Member: ${standupData.teamMemberName}\n`;
  context += `Date: ${standupData.timestamp}\n\n`;
  
  context += `CURRENT STANDUP:\n`;
  context += `Yesterday: ${standupData.yesterday}\n`;
  context += `Today: ${standupData.today}\n`;
  context += `Blockers: ${standupData.blockers}\n\n`;

  // Add Jira tasks context
  if (tasks && tasks.length > 0) {
    context += `JIRA TASKS (${tasks.length} total):\n`;
    tasks.slice(0, 5).forEach((task, index) => {
      context += `${index + 1}. ${task.fields?.summary || task.key} - Status: ${task.fields?.status?.name || 'Unknown'}\n`;
    });
    context += '\n';
  }

  // Add PR context
  if (prs && prs.length > 0) {
    context += `PULL REQUESTS (${prs.length} total):\n`;
    prs.slice(0, 5).forEach((pr, index) => {
      const commentCount = pr.comment_count || 0;
      const state = pr.state || 'Unknown';
      context += `${index + 1}. ${pr.title} - State: ${state}, Comments: ${commentCount}\n`;
    });
    context += '\n';
  }

  // Add previous updates context for pattern analysis
  if (previousUpdates && previousUpdates.length > 0) {
    context += `RECENT HISTORY:\n`;
    const recentUpdate = previousUpdates[previousUpdates.length - 1];
    context += `Last standup blockers: ${recentUpdate.blockers || 'None'}\n`;
    context += `Previous updates count: ${previousUpdates.length}\n\n`;
  }

  return context;
}

/**
 * Extract questions from AI text response
 */
function extractQuestionsFromText(text) {
  const questions = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.endsWith('?') && trimmed.length > 10) {
      // Remove numbering, bullets, etc.
      const cleaned = trimmed.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim();
      if (cleaned.length > 5) {
        questions.push(cleaned);
      }
    }
  }
  
  return questions;
}

/**
 * Generate fallback questions when AI is unavailable
 */
function generateFallbackQuestions(standupData, tasks, prs) {
  const questions = [];
  
  // Basic questions based on blockers
  if (standupData.blockers && standupData.blockers.toLowerCase() !== 'none' && standupData.blockers.trim() !== '') {
    questions.push(`What specific help do you need to resolve the blocker: "${standupData.blockers.substring(0, 50)}..."?`);
    questions.push('How long do you estimate it will take to resolve your current blockers?');
  }

  // Questions based on PR status
  const openPRs = prs.filter(pr => pr.state === 'OPEN');
  if (openPRs.length > 2) {
    questions.push(`You have ${openPRs.length} open PRs. Which ones are priority for review and merge?`);
  }

  // Questions based on tasks
  if (tasks.length > 5) {
    questions.push(`With ${tasks.length} assigned tasks, how are you prioritizing your work?`);
  }

  // Default questions if none generated
  if (questions.length === 0) {
    questions.push('Are there any dependencies on other team members that might affect your today\'s plan?');
    questions.push('Do you need any additional resources or support to complete your planned work?');
    questions.push('Are there any risks or concerns about meeting your sprint commitments?');
  }

  return questions;
}

/**
 * Analyze standup patterns and generate insights
 */
async function analyzeStandupPatterns(teamMemberName, currentStandup, historicalData) {
  try {
    const prompt = `Analyze the standup patterns for team member ${teamMemberName} and provide insights.

Current Standup:
${JSON.stringify(currentStandup, null, 2)}

Historical Data (last 5 standups):
${JSON.stringify(historicalData.slice(-5), null, 2)}

Provide analysis on:
1. Productivity trends
2. Recurring blockers
3. Task completion patterns
4. PR merge patterns
5. Areas for improvement

Return insights as a JSON object with categories: trends, concerns, recommendations.`;

    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const input = {
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.5,
        top_p: 0.8
      })
    };

    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      return {
        trends: ['Analysis completed'],
        concerns: [],
        recommendations: ['Continue current work patterns']
      };
    }

  } catch (error) {
    console.error('Error analyzing standup patterns:', error);
    return {
      trends: ['Unable to analyze patterns'],
      concerns: ['AI analysis unavailable'],
      recommendations: ['Manual review recommended']
    };
  }
}

module.exports = {
  generateFollowUpQuestions,
  analyzeStandupPatterns
};
