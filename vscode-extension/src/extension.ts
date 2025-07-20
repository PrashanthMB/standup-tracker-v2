import * as vscode from 'vscode';
import axios from 'axios';

interface StandupData {
    teamMemberName: string;
    yesterday: string;
    today: string;
    blockers: string;
}

interface StandupResponse {
    success: boolean;
    data: {
        standupId: string;
        teamMember: string;
        timestamp: string;
        summary: any;
        followUpQuestions: string[];
        insights: any[];
    };
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Standup Tracker extension is now active!');

    // Register commands
    const submitStandupCommand = vscode.commands.registerCommand('standupTracker.submitStandup', submitStandup);
    const viewStatusCommand = vscode.commands.registerCommand('standupTracker.viewStatus', viewTeamStatus);
    const chatInterfaceCommand = vscode.commands.registerCommand('standupTracker.chatInterface', openChatInterface);
    const viewMetricsCommand = vscode.commands.registerCommand('standupTracker.viewMetrics', viewTeamMetrics);

    // Register tree data provider for the sidebar
    const treeDataProvider = new StandupTreeDataProvider();
    vscode.window.createTreeView('standupTracker', { treeDataProvider });

    // Register chat participant for GitHub Copilot Chat integration
    const chatParticipant = vscode.chat.createChatParticipant('standup-tracker', handleChatRequest);
    chatParticipant.iconPath = vscode.Uri.file(context.asAbsolutePath('resources/icon.png'));

    context.subscriptions.push(
        submitStandupCommand,
        viewStatusCommand,
        chatInterfaceCommand,
        viewMetricsCommand,
        chatParticipant
    );

    // Auto-submit standup if configured
    const config = vscode.workspace.getConfiguration('standupTracker');
    if (config.get('autoSubmit')) {
        setTimeout(() => {
            vscode.commands.executeCommand('standupTracker.submitStandup');
        }, 5000); // Wait 5 seconds after activation
    }
}

/**
 * Handle GitHub Copilot Chat requests
 */
async function handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('standupTracker');
        const apiEndpoint = config.get<string>('apiEndpoint');
        const teamMemberName = config.get<string>('teamMemberName');

        if (!apiEndpoint) {
            stream.markdown('❌ **Standup Tracker API endpoint not configured.** Please set `standupTracker.apiEndpoint` in your settings.');
            return;
        }

        stream.progress('Processing your standup request...');

        // Detect intent from the chat message
        const message = request.prompt;
        const intent = detectChatIntent(message);

        let response;

        switch (intent) {
            case 'submit_standup':
                response = await handleStandupSubmission(message, teamMemberName, apiEndpoint);
                break;
            case 'view_status':
                response = await handleStatusQuery(teamMemberName, apiEndpoint);
                break;
            case 'team_metrics':
                response = await handleMetricsQuery(apiEndpoint);
                break;
            case 'help':
                response = getHelpResponse();
                break;
            default:
                response = await handleGeneralQuery(message, teamMemberName, apiEndpoint);
        }

        // Stream the response
        if (response.type === 'markdown') {
            stream.markdown(response.content);
        } else if (response.type === 'structured') {
            stream.markdown(response.content);
            if (response.followUp) {
                stream.button({
                    command: response.followUp.command,
                    title: response.followUp.title
                });
            }
        }

    } catch (error) {
        console.error('Error handling chat request:', error);
        stream.markdown(`❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    }
}

/**
 * Detect intent from chat message
 */
function detectChatIntent(message: string): string {
    const messageLower = message.toLowerCase();

    if (messageLower.includes('submit') || messageLower.includes('standup') || messageLower.includes('yesterday') || messageLower.includes('today')) {
        return 'submit_standup';
    }
    if (messageLower.includes('status') || messageLower.includes('team') || messageLower.includes('member')) {
        return 'view_status';
    }
    if (messageLower.includes('metrics') || messageLower.includes('statistics') || messageLower.includes('analytics')) {
        return 'team_metrics';
    }
    if (messageLower.includes('help') || messageLower.includes('how') || messageLower.includes('what')) {
        return 'help';
    }

    return 'general';
}

/**
 * Handle standup submission through chat
 */
async function handleStandupSubmission(message: string, teamMemberName: string | undefined, apiEndpoint: string) {
    if (!teamMemberName) {
        return {
            type: 'markdown',
            content: '❌ **Team member name not configured.** Please set `standupTracker.teamMemberName` in your settings.'
        };
    }

    // Try to extract standup information from the message
    const standupData = extractStandupFromMessage(message, teamMemberName);
    
    if (!standupData.yesterday || !standupData.today) {
        return {
            type: 'structured',
            content: '📝 **Let me help you submit your standup.** I need more information:\n\n' +
                     '• What did you work on **yesterday**?\n' +
                     '• What will you work on **today**?\n' +
                     '• Any **blockers**?',
            followUp: {
                command: 'standupTracker.submitStandup',
                title: 'Open Standup Form'
            }
        };
    }

    try {
        const response = await axios.post(`${apiEndpoint}/standup`, standupData);
        const result: StandupResponse = response.data;

        let content = `✅ **Standup submitted successfully!**\n\n`;
        content += `**Team Member:** ${result.data.teamMember}\n`;
        content += `**Time:** ${new Date(result.data.timestamp).toLocaleString()}\n\n`;

        if (result.data.followUpQuestions && result.data.followUpQuestions.length > 0) {
            content += `**Follow-up Questions:**\n`;
            result.data.followUpQuestions.forEach((question, index) => {
                content += `${index + 1}. ${question}\n`;
            });
        }

        if (result.data.insights && result.data.insights.length > 0) {
            content += `\n**Insights:**\n`;
            result.data.insights.forEach(insight => {
                const icon = insight.priority === 'high' ? '🔴' : insight.priority === 'medium' ? '🟡' : '🟢';
                content += `${icon} ${insight.message}\n`;
            });
        }

        return {
            type: 'markdown',
            content
        };

    } catch (error) {
        return {
            type: 'markdown',
            content: `❌ **Failed to submit standup:** ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Handle status queries
 */
async function handleStatusQuery(teamMemberName: string | undefined, apiEndpoint: string) {
    try {
        const chatResponse = await axios.post(`${apiEndpoint}/copilot-chat`, {
            message: `What's the status for ${teamMemberName || 'the team'}?`,
            teamMember: teamMemberName,
            intent: 'standup_status'
        });

        const result = chatResponse.data;
        
        let content = `📊 **Team Status**\n\n`;
        
        if (result.data && result.data.summary) {
            const summary = result.data.summary;
            content += `**Current Work:**\n`;
            content += `• Active Tasks: ${summary.activeTasks || 0}\n`;
            content += `• Total Tasks: ${summary.totalTasks || 0}\n`;
            content += `• Open PRs: ${summary.openPRs || 0}\n`;
            content += `• Total PRs: ${summary.totalPRs || 0}\n\n`;
        }

        if (result.data && result.data.insights) {
            content += `**Insights:**\n`;
            result.data.insights.forEach((insight: string) => {
                content += `• ${insight}\n`;
            });
        }

        return {
            type: 'markdown',
            content
        };

    } catch (error) {
        return {
            type: 'markdown',
            content: `❌ **Failed to fetch status:** ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Handle metrics queries
 */
async function handleMetricsQuery(apiEndpoint: string) {
    try {
        const response = await axios.get(`${apiEndpoint}/data/metrics`);
        const metrics = response.data.data.metrics;

        let content = `📈 **Team Metrics**\n\n`;
        content += `**Overview:**\n`;
        content += `• Total Standups: ${metrics.totalStandups}\n`;
        content += `• Active Members: ${metrics.activeMembers}\n`;
        content += `• Avg Tasks/Member: ${metrics.averageTasksPerMember}\n`;
        content += `• Avg PRs/Member: ${metrics.averagePRsPerMember}\n\n`;

        if (metrics.topBlockers && metrics.topBlockers.length > 0) {
            content += `**Top Blockers:**\n`;
            metrics.topBlockers.slice(0, 3).forEach((blocker: any, index: number) => {
                content += `${index + 1}. ${blocker.blocker} (${blocker.count} times)\n`;
            });
        }

        return {
            type: 'markdown',
            content
        };

    } catch (error) {
        return {
            type: 'markdown',
            content: `❌ **Failed to fetch metrics:** ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Handle general queries
 */
async function handleGeneralQuery(message: string, teamMemberName: string | undefined, apiEndpoint: string) {
    try {
        const chatResponse = await axios.post(`${apiEndpoint}/copilot-chat`, {
            message,
            teamMember: teamMemberName,
            intent: 'general_query'
        });

        const result = chatResponse.data;
        
        return {
            type: 'markdown',
            content: result.message || 'I can help you with standup tracking, team status, and metrics. What would you like to know?'
        };

    } catch (error) {
        return {
            type: 'markdown',
            content: `❌ **Error:** ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Get help response
 */
function getHelpResponse() {
    return {
        type: 'markdown',
        content: `🤖 **Standup Tracker Help**\n\n` +
                 `I can help you with:\n\n` +
                 `**📝 Submit Standup:**\n` +
                 `• "Submit my standup: Yesterday I worked on X, today I'll work on Y, no blockers"\n` +
                 `• Use the command: \`Standup Tracker: Submit Daily Standup\`\n\n` +
                 `**📊 View Status:**\n` +
                 `• "What's my current status?"\n` +
                 `• "Show team status"\n\n` +
                 `**📈 Team Metrics:**\n` +
                 `• "Show team metrics"\n` +
                 `• "What are the team statistics?"\n\n` +
                 `**⚙️ Configuration:**\n` +
                 `• Set your API endpoint in settings: \`standupTracker.apiEndpoint\`\n` +
                 `• Set your team member name: \`standupTracker.teamMemberName\`\n\n` +
                 `**💡 Tips:**\n` +
                 `• Use natural language to describe your standup\n` +
                 `• Ask about specific team members or blockers\n` +
                 `• Request insights and recommendations`
    };
}

/**
 * Extract standup information from chat message
 */
function extractStandupFromMessage(message: string, teamMemberName: string): StandupData {
    const standupData: StandupData = {
        teamMemberName,
        yesterday: '',
        today: '',
        blockers: 'None'
    };

    // Simple extraction logic - can be enhanced with NLP
    const messageLower = message.toLowerCase();
    
    // Extract yesterday's work
    const yesterdayMatch = message.match(/yesterday[:\s]+([^.!?]*[.!?]?)/i);
    if (yesterdayMatch) {
        standupData.yesterday = yesterdayMatch[1].trim();
    }

    // Extract today's work
    const todayMatch = message.match(/today[:\s]+([^.!?]*[.!?]?)/i);
    if (todayMatch) {
        standupData.today = todayMatch[1].trim();
    }

    // Extract blockers
    const blockerMatch = message.match(/blocker[s]?[:\s]+([^.!?]*[.!?]?)/i);
    if (blockerMatch) {
        standupData.blockers = blockerMatch[1].trim();
    } else if (messageLower.includes('no blocker') || messageLower.includes('no block')) {
        standupData.blockers = 'None';
    }

    return standupData;
}

/**
 * Submit standup command handler
 */
async function submitStandup() {
    const config = vscode.workspace.getConfiguration('standupTracker');
    const teamMemberName = config.get<string>('teamMemberName');

    if (!teamMemberName) {
        vscode.window.showErrorMessage('Please configure your team member name in settings.');
        return;
    }

    // Create input form
    const yesterday = await vscode.window.showInputBox({
        prompt: 'What did you work on yesterday?',
        placeHolder: 'Describe your work from yesterday...'
    });

    if (!yesterday) return;

    const today = await vscode.window.showInputBox({
        prompt: 'What will you work on today?',
        placeHolder: 'Describe your planned work for today...'
    });

    if (!today) return;

    const blockers = await vscode.window.showInputBox({
        prompt: 'Any blockers?',
        placeHolder: 'Describe any blockers or type "None"...',
        value: 'None'
    });

    const standupData: StandupData = {
        teamMemberName,
        yesterday,
        today,
        blockers: blockers || 'None'
    };

    try {
        const apiEndpoint = config.get<string>('apiEndpoint');
        if (!apiEndpoint) {
            vscode.window.showErrorMessage('API endpoint not configured.');
            return;
        }

        const response = await axios.post(`${apiEndpoint}/standup`, standupData);
        const result: StandupResponse = response.data;

        let message = `Standup submitted successfully!\n\n`;
        if (result.data.followUpQuestions.length > 0) {
            message += `Follow-up questions:\n${result.data.followUpQuestions.join('\n')}`;
        }

        vscode.window.showInformationMessage(message);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to submit standup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * View team status command handler
 */
async function viewTeamStatus() {
    const config = vscode.workspace.getConfiguration('standupTracker');
    const apiEndpoint = config.get<string>('apiEndpoint');

    if (!apiEndpoint) {
        vscode.window.showErrorMessage('API endpoint not configured.');
        return;
    }

    try {
        const response = await axios.get(`${apiEndpoint}/data/metrics`);
        const metrics = response.data.data.metrics;

        const panel = vscode.window.createWebviewPanel(
            'teamStatus',
            'Team Status',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = generateStatusHTML(metrics);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch team status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Open chat interface command handler
 */
async function openChatInterface() {
    // This will open the GitHub Copilot Chat with our participant
    vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    
    // Show a message about how to use the chat
    vscode.window.showInformationMessage(
        'Use @standup-tracker in GitHub Copilot Chat to interact with the standup system!'
    );
}

/**
 * View team metrics command handler
 */
async function viewTeamMetrics() {
    const config = vscode.workspace.getConfiguration('standupTracker');
    const apiEndpoint = config.get<string>('apiEndpoint');

    if (!apiEndpoint) {
        vscode.window.showErrorMessage('API endpoint not configured.');
        return;
    }

    try {
        const response = await axios.get(`${apiEndpoint}/data/metrics`);
        const metrics = response.data.data.metrics;

        const panel = vscode.window.createWebviewPanel(
            'teamMetrics',
            'Team Metrics',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = generateMetricsHTML(metrics);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch team metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Generate HTML for status display
 */
function generateStatusHTML(metrics: any): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Team Status</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
                .metric-value { font-weight: bold; color: #007acc; }
            </style>
        </head>
        <body>
            <h1>Team Status</h1>
            <div class="metric">
                <strong>Total Standups:</strong> <span class="metric-value">${metrics.totalStandups}</span>
            </div>
            <div class="metric">
                <strong>Active Members:</strong> <span class="metric-value">${metrics.activeMembers}</span>
            </div>
            <div class="metric">
                <strong>Average Tasks per Member:</strong> <span class="metric-value">${metrics.averageTasksPerMember}</span>
            </div>
            <div class="metric">
                <strong>Average PRs per Member:</strong> <span class="metric-value">${metrics.averagePRsPerMember}</span>
            </div>
        </body>
        </html>
    `;
}

/**
 * Generate HTML for metrics display
 */
function generateMetricsHTML(metrics: any): string {
    let blockersHTML = '';
    if (metrics.topBlockers && metrics.topBlockers.length > 0) {
        blockersHTML = '<h2>Top Blockers</h2><ul>';
        metrics.topBlockers.forEach((blocker: any) => {
            blockersHTML += `<li>${blocker.blocker} (${blocker.count} times)</li>`;
        });
        blockersHTML += '</ul>';
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Team Metrics</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
                .metric-value { font-weight: bold; color: #007acc; }
                ul { list-style-type: disc; margin-left: 20px; }
            </style>
        </head>
        <body>
            <h1>Team Metrics</h1>
            <div class="metric">
                <strong>Total Standups:</strong> <span class="metric-value">${metrics.totalStandups}</span>
            </div>
            <div class="metric">
                <strong>Active Members:</strong> <span class="metric-value">${metrics.activeMembers}</span>
            </div>
            <div class="metric">
                <strong>Average Tasks per Member:</strong> <span class="metric-value">${metrics.averageTasksPerMember}</span>
            </div>
            <div class="metric">
                <strong>Average PRs per Member:</strong> <span class="metric-value">${metrics.averagePRsPerMember}</span>
            </div>
            ${blockersHTML}
        </body>
        </html>
    `;
}

/**
 * Tree data provider for the sidebar
 */
class StandupTreeDataProvider implements vscode.TreeDataProvider<StandupTreeItem> {
    getTreeItem(element: StandupTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: StandupTreeItem): Thenable<StandupTreeItem[]> {
        if (!element) {
            return Promise.resolve([
                new StandupTreeItem('Submit Standup', vscode.TreeItemCollapsibleState.None, 'standupTracker.submitStandup'),
                new StandupTreeItem('View Team Status', vscode.TreeItemCollapsibleState.None, 'standupTracker.viewStatus'),
                new StandupTreeItem('Team Metrics', vscode.TreeItemCollapsibleState.None, 'standupTracker.viewMetrics'),
                new StandupTreeItem('Open Chat', vscode.TreeItemCollapsibleState.None, 'standupTracker.chatInterface')
            ]);
        }
        return Promise.resolve([]);
    }
}

class StandupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly commandId?: string
    ) {
        super(label, collapsibleState);
        if (commandId) {
            this.command = {
                command: commandId,
                title: label
            };
        }
    }
}

export function deactivate() {}
