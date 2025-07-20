#!/usr/bin/env node

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Configuration file path
const CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE, '.standup-tracker-config.json');

// Default configuration
const DEFAULT_CONFIG = {
    apiEndpoint: 'https://your-api-gateway-url.amazonaws.com/dev',
    teamMemberName: '',
    autoSubmit: false
};

/**
 * Standup Tracker CLI
 * A command-line interface for the daily standup tracking system
 */
class StandupCLI {
    constructor() {
        this.config = this.loadConfig();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
                return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
            }
        } catch (error) {
            console.warn('Warning: Could not load configuration file. Using defaults.');
        }
        return { ...DEFAULT_CONFIG };
    }

    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
            console.log('✅ Configuration saved successfully!');
        } catch (error) {
            console.error('❌ Failed to save configuration:', error.message);
        }
    }

    /**
     * Prompt user for input
     */
    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * Display help information
     */
    showHelp() {
        console.log(`
🤖 Standup Tracker CLI

USAGE:
  standup-cli [command]

COMMANDS:
  submit          Submit your daily standup
  status          View team status
  metrics         View team metrics
  config          Configure settings
  chat            Interactive chat mode
  help            Show this help message

EXAMPLES:
  standup-cli submit
  standup-cli status
  standup-cli metrics
  standup-cli config
  standup-cli chat

CONFIGURATION:
  Configuration is stored in: ${CONFIG_FILE}
  
  Required settings:
  - apiEndpoint: Your AWS Lambda API Gateway URL
  - teamMemberName: Your name for standup submissions

For more information, visit: https://github.com/your-repo/standup-tracker-v2
        `);
    }

    /**
     * Configure settings
     */
    async configure() {
        console.log('\n⚙️  Standup Tracker Configuration\n');

        console.log('Current configuration:');
        console.log(`  API Endpoint: ${this.config.apiEndpoint}`);
        console.log(`  Team Member Name: ${this.config.teamMemberName}`);
        console.log(`  Auto Submit: ${this.config.autoSubmit}\n`);

        const apiEndpoint = await this.prompt(`Enter API Endpoint (${this.config.apiEndpoint}): `);
        if (apiEndpoint) {
            this.config.apiEndpoint = apiEndpoint;
        }

        const teamMemberName = await this.prompt(`Enter your team member name (${this.config.teamMemberName}): `);
        if (teamMemberName) {
            this.config.teamMemberName = teamMemberName;
        }

        const autoSubmit = await this.prompt(`Enable auto-submit? (y/n) [${this.config.autoSubmit ? 'y' : 'n'}]: `);
        if (autoSubmit.toLowerCase() === 'y' || autoSubmit.toLowerCase() === 'yes') {
            this.config.autoSubmit = true;
        } else if (autoSubmit.toLowerCase() === 'n' || autoSubmit.toLowerCase() === 'no') {
            this.config.autoSubmit = false;
        }

        this.saveConfig();
    }

    /**
     * Submit standup
     */
    async submitStandup() {
        if (!this.config.teamMemberName) {
            console.log('❌ Team member name not configured. Run: standup-cli config');
            return;
        }

        if (!this.config.apiEndpoint || this.config.apiEndpoint === DEFAULT_CONFIG.apiEndpoint) {
            console.log('❌ API endpoint not configured. Run: standup-cli config');
            return;
        }

        console.log('\n📝 Submit Daily Standup\n');

        const yesterday = await this.prompt('What did you work on yesterday? ');
        if (!yesterday) {
            console.log('❌ Yesterday\'s work is required.');
            return;
        }

        const today = await this.prompt('What will you work on today? ');
        if (!today) {
            console.log('❌ Today\'s work is required.');
            return;
        }

        const blockers = await this.prompt('Any blockers? (or "None"): ') || 'None';

        const standupData = {
            teamMemberName: this.config.teamMemberName,
            yesterday,
            today,
            blockers
        };

        try {
            console.log('\n⏳ Submitting standup...');
            
            const response = await axios.post(`${this.config.apiEndpoint}/standup`, standupData);
            const result = response.data;

            console.log('\n✅ Standup submitted successfully!\n');
            console.log(`📊 Summary:`);
            console.log(`   Team Member: ${result.data.teamMember}`);
            console.log(`   Timestamp: ${new Date(result.data.timestamp).toLocaleString()}`);
            console.log(`   Tasks: ${result.data.summary.jiraTasksCount || 0}`);
            console.log(`   PRs: ${result.data.summary.openPRsCount || 0}`);

            if (result.data.followUpQuestions && result.data.followUpQuestions.length > 0) {
                console.log('\n🤔 Follow-up Questions:');
                result.data.followUpQuestions.forEach((question, index) => {
                    console.log(`   ${index + 1}. ${question}`);
                });
            }

            if (result.data.insights && result.data.insights.length > 0) {
                console.log('\n💡 Insights:');
                result.data.insights.forEach(insight => {
                    const icon = insight.priority === 'high' ? '🔴' : insight.priority === 'medium' ? '🟡' : '🟢';
                    console.log(`   ${icon} ${insight.message}`);
                });
            }

        } catch (error) {
            console.error('\n❌ Failed to submit standup:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Message: ${error.response.data?.error || error.message}`);
            } else {
                console.error(`   Error: ${error.message}`);
            }
        }
    }

    /**
     * View team status
     */
    async viewStatus() {
        if (!this.config.apiEndpoint || this.config.apiEndpoint === DEFAULT_CONFIG.apiEndpoint) {
            console.log('❌ API endpoint not configured. Run: standup-cli config');
            return;
        }

        try {
            console.log('\n⏳ Fetching team status...');

            const response = await axios.post(`${this.config.apiEndpoint}/copilot-chat`, {
                message: 'What\'s the team status?',
                teamMember: this.config.teamMemberName,
                intent: 'team_metrics'
            });

            const result = response.data;

            console.log('\n📊 Team Status\n');

            if (result.data && result.data.overview) {
                const overview = result.data.overview;
                console.log(`📈 Overview:`);
                console.log(`   Total Standups: ${overview.totalStandups}`);
                console.log(`   Active Members: ${overview.activeMembers}`);
                console.log(`   Avg Tasks/Member: ${overview.averageTasksPerMember}`);
                console.log(`   Avg PRs/Member: ${overview.averagePRsPerMember}`);
            }

            if (result.data && result.data.topBlockers && result.data.topBlockers.length > 0) {
                console.log(`\n🚫 Top Blockers:`);
                result.data.topBlockers.forEach((blocker, index) => {
                    console.log(`   ${index + 1}. ${blocker.blocker} (${blocker.count} times)`);
                });
            }

            if (result.data && result.data.insights && result.data.insights.length > 0) {
                console.log(`\n💡 Insights:`);
                result.data.insights.forEach(insight => {
                    console.log(`   • ${insight}`);
                });
            }

        } catch (error) {
            console.error('\n❌ Failed to fetch team status:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Message: ${error.response.data?.error || error.message}`);
            } else {
                console.error(`   Error: ${error.message}`);
            }
        }
    }

    /**
     * View team metrics
     */
    async viewMetrics() {
        if (!this.config.apiEndpoint || this.config.apiEndpoint === DEFAULT_CONFIG.apiEndpoint) {
            console.log('❌ API endpoint not configured. Run: standup-cli config');
            return;
        }

        try {
            console.log('\n⏳ Fetching team metrics...');

            const response = await axios.get(`${this.config.apiEndpoint}/data/history/metrics`);
            const metrics = response.data.data.metrics;

            console.log('\n📈 Team Metrics\n');

            console.log(`📊 Overview:`);
            console.log(`   Total Standups: ${metrics.totalStandups}`);
            console.log(`   Active Members: ${metrics.activeMembers}`);
            console.log(`   Average Tasks per Member: ${metrics.averageTasksPerMember}`);
            console.log(`   Average PRs per Member: ${metrics.averagePRsPerMember}`);

            if (metrics.topBlockers && metrics.topBlockers.length > 0) {
                console.log(`\n🚫 Most Common Blockers:`);
                metrics.topBlockers.slice(0, 5).forEach((blocker, index) => {
                    console.log(`   ${index + 1}. ${blocker.blocker} (${blocker.count} occurrences)`);
                });
            }

            if (metrics.memberStats) {
                const topMembers = Object.entries(metrics.memberStats)
                    .sort(([,a], [,b]) => b.standupCount - a.standupCount)
                    .slice(0, 5);

                if (topMembers.length > 0) {
                    console.log(`\n👥 Most Active Members:`);
                    topMembers.forEach(([member, stats], index) => {
                        console.log(`   ${index + 1}. ${member} (${stats.standupCount} standups)`);
                    });
                }
            }

        } catch (error) {
            console.error('\n❌ Failed to fetch team metrics:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Message: ${error.response.data?.error || error.message}`);
            } else {
                console.error(`   Error: ${error.message}`);
            }
        }
    }

    /**
     * Interactive chat mode
     */
    async chatMode() {
        if (!this.config.apiEndpoint || this.config.apiEndpoint === DEFAULT_CONFIG.apiEndpoint) {
            console.log('❌ API endpoint not configured. Run: standup-cli config');
            return;
        }

        console.log('\n💬 Interactive Chat Mode');
        console.log('Type your questions about standups, team status, or metrics.');
        console.log('Type "exit" to quit chat mode.\n');

        while (true) {
            const message = await this.prompt('You: ');
            
            if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
                console.log('👋 Goodbye!');
                break;
            }

            if (!message) continue;

            try {
                console.log('⏳ Processing...');

                const response = await axios.post(`${this.config.apiEndpoint}/copilot-chat`, {
                    message,
                    teamMember: this.config.teamMemberName,
                    intent: 'general_query'
                });

                const result = response.data;
                console.log(`\n🤖 Assistant: ${result.message || 'I can help you with standup tracking, team status, and metrics.'}\n`);

                if (result.suggestions && result.suggestions.length > 0) {
                    console.log('💡 Suggestions:');
                    result.suggestions.forEach((suggestion, index) => {
                        console.log(`   ${index + 1}. ${suggestion}`);
                    });
                    console.log('');
                }

            } catch (error) {
                console.error('❌ Error:', error.response?.data?.error || error.message);
                console.log('');
            }
        }
    }

    /**
     * Run the CLI
     */
    async run() {
        const args = process.argv.slice(2);
        const command = args[0];

        console.log('🤖 Standup Tracker CLI v1.0.0\n');

        try {
            switch (command) {
                case 'submit':
                    await this.submitStandup();
                    break;
                case 'status':
                    await this.viewStatus();
                    break;
                case 'metrics':
                    await this.viewMetrics();
                    break;
                case 'config':
                    await this.configure();
                    break;
                case 'chat':
                    await this.chatMode();
                    break;
                case 'help':
                case '--help':
                case '-h':
                    this.showHelp();
                    break;
                default:
                    if (command) {
                        console.log(`❌ Unknown command: ${command}\n`);
                    }
                    this.showHelp();
                    break;
            }
        } catch (error) {
            console.error('❌ An error occurred:', error.message);
        } finally {
            this.rl.close();
        }
    }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
    const cli = new StandupCLI();
    cli.run().catch(console.error);
}

module.exports = StandupCLI;
