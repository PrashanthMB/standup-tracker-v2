# Daily Standup Tracker v2

A comprehensive AI-powered daily standup tracking system with AWS Lambda, Amazon Bedrock, Jira/Bitbucket integration, and VS Code GitHub Copilot Chat interface.

## 🚀 Features

- **AI-Powered Analysis**: Uses Amazon Bedrock (Claude) to analyze standup updates and generate intelligent follow-up questions
- **Multi-Format Storage**: Stores data in both JSON and CSV formats with automatic S3 backups
- **Jira Integration**: Fetches team member tasks and project status
- **Bitbucket Integration**: Monitors pull request status and review metrics
- **Smart Questioning**: Asks follow-up questions about incomplete tickets, unmerged PRs, and blockers
- **VS Code Integration**: CLI and extension for seamless workflow integration
- **Progress Tracking**: View team progress and productivity metrics
- **Context Awareness**: Compares current updates with previous entries to identify patterns

## 🏗️ Architecture

### Backend (AWS Serverless)
- **AWS Lambda**: Serverless functions for all API endpoints
- **Amazon Bedrock**: AI-powered analysis using Claude model
- **Amazon S3**: Storage for JSON/CSV data with versioning
- **API Gateway**: RESTful API endpoints

### Frontend Options
- **CLI Interface**: Command-line tool for quick standup submissions
- **VS Code Extension**: Integrated development environment support
- **GitHub Copilot Chat**: Natural language interaction

### Integrations
- **Jira API**: Task and project management integration
- **Bitbucket API**: Pull request and repository analytics
- **GitHub**: Code repository and collaboration

## 📋 Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate permissions
- AWS account with Bedrock access
- Jira account with API access
- Bitbucket account with app passwords
- Serverless Framework installed globally

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd standup-tracker-v2
npm install
```

### 2. Configure Environment Variables

Copy the `.env` file and update with your credentials:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here

# Amazon Bedrock Configuration
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_REGION=us-east-1

# Jira Configuration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your_jira_api_token_here

# Bitbucket Configuration
BITBUCKET_WORKSPACE=your_workspace
BITBUCKET_USERNAME=your_username
BITBUCKET_APP_PASSWORD=your_bitbucket_app_password_here

# Storage Configuration
STORAGE_TYPE=both  # Options: json, csv, both
S3_BUCKET_NAME=standup-tracker-storage
S3_REGION=us-east-1

# GitHub Token
GITHUB_TOKEN=your_github_token_here
```

### 3. Deploy to AWS

```bash
# Install Serverless Framework globally
npm install -g serverless

# Deploy the application
serverless deploy

# Note the API Gateway URL from the deployment output
```

### 4. Configure CLI Tool

```bash
# Make CLI executable
chmod +x cli/standup-cli.js

# Create symlink for global access (optional)
npm link

# Configure the CLI
node cli/standup-cli.js config
```

## 🎯 Usage

### CLI Interface

```bash
# Submit daily standup
standup-cli submit

# View team status
standup-cli status

# View team metrics
standup-cli metrics

# Interactive chat mode
standup-cli chat

# Configure settings
standup-cli config
```

### API Endpoints

#### Submit Standup
```bash
POST /standup
{
  "teamMemberName": "John Doe",
  "yesterday": "Worked on user authentication feature",
  "today": "Will implement password reset functionality",
  "blockers": "Waiting for API documentation from backend team"
}
```

#### Get Team Member Tasks (Jira)
```bash
GET /jira/tasks/{teamMember}
```

#### Get PR Status (Bitbucket)
```bash
GET /bitbucket/prs/{teamMember}
```

#### Copilot Chat Interface
```bash
POST /copilot-chat
{
  "message": "What's the team status?",
  "teamMember": "John Doe",
  "intent": "team_metrics"
}
```

#### Get Standup History
```bash
GET /data/history/{teamMember}?startDate=2024-01-01&endDate=2024-01-31&format=json
```

### VS Code Integration

1. Install the extension from `vscode-extension/` directory
2. Configure your API endpoint and team member name in VS Code settings
3. Use commands:
   - `Standup Tracker: Submit Daily Standup`
   - `Standup Tracker: View Team Status`
   - `Standup Tracker: Team Metrics`
   - `Standup Tracker: Open Chat`

### GitHub Copilot Chat Integration

Use natural language with the `@standup-tracker` participant:

```
@standup-tracker Submit my standup: Yesterday I worked on the login feature, today I'll work on password reset, no blockers

@standup-tracker What's the team status?

@standup-tracker Show me John's current tasks

@standup-tracker What are the most common blockers?
```

## 📊 Data Storage

### JSON Format
```json
{
  "id": "uuid",
  "teamMemberName": "John Doe",
  "timestamp": "2024-01-15T10:30:00Z",
  "yesterday": "Worked on authentication",
  "today": "Will work on password reset",
  "blockers": "None",
  "jiraTasks": [...],
  "bitbucketPRs": [...],
  "followUpQuestions": [...],
  "insights": [...]
}
```

### CSV Format
Flattened structure with columns for easy analysis:
- `id`, `teamMemberName`, `timestamp`
- `yesterday`, `today`, `blockers`
- `jiraTasksCount`, `bitbucketPRsCount`
- `followUpQuestionsCount`, etc.

## 🤖 AI Features

### Intelligent Follow-up Questions
- Analyzes incomplete tasks and suggests questions
- Identifies PR review bottlenecks
- Detects recurring blockers
- Provides context-aware recommendations

### Pattern Analysis
- Compares current updates with historical data
- Identifies productivity trends
- Suggests process improvements
- Highlights team collaboration patterns

## 📈 Metrics & Analytics

### Team Metrics
- Total standups submitted
- Active team members
- Average tasks per member
- Average PRs per member
- Most common blockers

### Individual Metrics
- Standup consistency
- Task completion patterns
- PR review participation
- Blocker frequency

### Productivity Insights
- Work pattern analysis
- Collaboration effectiveness
- Bottleneck identification
- Trend analysis

## 🔧 Configuration Options

### Storage Configuration
```javascript
STORAGE_TYPE=both  // json, csv, or both
```

### AI Model Configuration
```javascript
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

### Integration Settings
- Jira: Configure base URL, email, and API token
- Bitbucket: Configure workspace, username, and app password
- GitHub: Configure personal access token

## 🚀 Deployment

### AWS Lambda Deployment
```bash
# Deploy all functions
serverless deploy

# Deploy specific function
serverless deploy function -f standupProcessor

# View logs
serverless logs -f standupProcessor -t
```

### Environment-Specific Deployments
```bash
# Deploy to staging
serverless deploy --stage staging

# Deploy to production
serverless deploy --stage production
```

## 🔒 Security

- All API keys stored in environment variables
- S3 bucket with private access and versioning
- IAM roles with minimal required permissions
- HTTPS-only API endpoints
- Input validation and sanitization

## 🧪 Testing

```bash
# Run tests
npm test

# Test specific function locally
serverless invoke local -f standupProcessor -p test/standup-payload.json

# Test API endpoints
curl -X POST https://your-api-url/dev/standup \
  -H "Content-Type: application/json" \
  -d '{"teamMemberName":"Test User","yesterday":"Testing","today":"More testing","blockers":"None"}'
```

## 📝 API Documentation

### Standup Endpoints
- `POST /standup` - Submit standup update
- `GET /data/history/{teamMember}` - Get standup history
- `GET /data/metrics` - Get team metrics

### Integration Endpoints
- `GET /jira/tasks/{teamMember}` - Get Jira tasks
- `GET /bitbucket/prs/{teamMember}` - Get Bitbucket PRs
- `POST /copilot-chat` - Chat interface

### Analytics Endpoints
- `GET /data/productivity` - Productivity metrics
- `GET /data/blockers/{teamMember}` - Blocker analysis
- `GET /data/summary/{teamMember}` - Member summary

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section below
2. Review the API documentation
3. Create an issue on GitHub

## 🔧 Troubleshooting

### Common Issues

**API Endpoint Not Configured**
```bash
# Configure CLI
standup-cli config
# Set your API Gateway URL from serverless deploy output
```

**Bedrock Access Denied**
```bash
# Ensure your AWS account has Bedrock access
# Check IAM permissions for bedrock:InvokeModel
```

**Jira/Bitbucket Integration Issues**
```bash
# Verify API tokens and permissions
# Check network connectivity to APIs
# Review error logs in CloudWatch
```

**Storage Issues**
```bash
# Check S3 bucket permissions
# Verify bucket name in configuration
# Review CloudWatch logs for detailed errors
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=standup-tracker:*
node cli/standup-cli.js submit
```

## 🎉 Getting Started

1. **Quick Setup**: Follow the installation steps above
2. **Configure**: Set up your API keys and endpoints
3. **Deploy**: Deploy to AWS using Serverless Framework
4. **Test**: Submit your first standup using the CLI
5. **Integrate**: Set up VS Code extension or use Copilot Chat
6. **Analyze**: View team metrics and insights

---

**Happy Standup Tracking! 🚀**
