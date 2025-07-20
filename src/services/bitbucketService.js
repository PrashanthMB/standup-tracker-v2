const axios = require('axios');

/**
 * Bitbucket Service for fetching pull request information and repository data
 */
class BitbucketService {
  constructor() {
    this.workspace = process.env.BITBUCKET_WORKSPACE;
    this.username = process.env.BITBUCKET_USERNAME;
    this.appPassword = process.env.BITBUCKET_APP_PASSWORD;
    this.baseURL = 'https://api.bitbucket.org/2.0';
    
    if (!this.workspace || !this.username || !this.appPassword) {
      console.warn('Bitbucket configuration incomplete. Some features may not work.');
    }
    
    // Create axios instance with authentication
    this.client = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: this.username,
        password: this.appPassword
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get pull requests for a specific team member
   */
  async getPRStatus(teamMemberName) {
    try {
      console.log(`Fetching Bitbucket PRs for ${teamMemberName}`);
      
      if (!this.workspace || !this.appPassword) {
        console.warn('Bitbucket not configured, returning empty PRs');
        return [];
      }

      // Get all repositories in the workspace first
      const repositories = await this.getWorkspaceRepositories();
      
      if (repositories.length === 0) {
        console.log('No repositories found in workspace');
        return [];
      }

      const allPRs = [];
      
      // Search PRs across all repositories
      for (const repo of repositories.slice(0, 10)) { // Limit to first 10 repos to avoid rate limits
        try {
          const repoPRs = await this.getRepositoryPRs(repo.name, teamMemberName);
          allPRs.push(...repoPRs);
        } catch (repoError) {
          console.warn(`Error fetching PRs from repository ${repo.name}:`, repoError.message);
        }
      }

      console.log(`Found ${allPRs.length} PRs for ${teamMemberName} across ${repositories.length} repositories`);
      
      // Sort by updated date (most recent first)
      return allPRs.sort((a, b) => new Date(b.updated_on) - new Date(a.updated_on));

    } catch (error) {
      console.error('Error fetching Bitbucket PRs:', error.message);
      
      if (error.response) {
        console.error('Bitbucket API Error:', {
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
   * Get repositories in the workspace
   */
  async getWorkspaceRepositories() {
    try {
      const response = await this.client.get(`/repositories/${this.workspace}`, {
        params: {
          pagelen: 50,
          sort: '-updated_on'
        }
      });

      return response.data.values?.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        size: repo.size,
        isPrivate: repo.is_private,
        createdOn: repo.created_on,
        updatedOn: repo.updated_on,
        hasIssues: repo.has_issues,
        hasWiki: repo.has_wiki,
        url: repo.links?.html?.href
      })) || [];

    } catch (error) {
      console.error('Error fetching workspace repositories:', error.message);
      return [];
    }
  }

  /**
   * Get pull requests for a specific repository
   */
  async getRepositoryPRs(repositoryName, authorName = null) {
    try {
      const params = {
        pagelen: 50,
        sort: '-updated_on',
        state: 'OPEN,MERGED,DECLINED'
      };

      // Filter by author if specified
      if (authorName) {
        params.q = `author.username="${authorName}"`;
      }

      const response = await this.client.get(`/repositories/${this.workspace}/${repositoryName}/pullrequests`, {
        params
      });

      const prs = response.data.values || [];
      
      // Get additional details for each PR
      const detailedPRs = await Promise.all(
        prs.map(async (pr) => {
          try {
            const details = await this.getPRDetails(repositoryName, pr.id);
            return { ...pr, ...details };
          } catch (detailError) {
            console.warn(`Error fetching details for PR ${pr.id}:`, detailError.message);
            return pr;
          }
        })
      );

      return detailedPRs.map(pr => ({
        id: pr.id,
        title: pr.title,
        description: pr.description,
        state: pr.state,
        author: {
          username: pr.author?.username,
          displayName: pr.author?.display_name,
          uuid: pr.author?.uuid
        },
        source: {
          branch: pr.source?.branch?.name,
          commit: pr.source?.commit?.hash
        },
        destination: {
          branch: pr.destination?.branch?.name,
          commit: pr.destination?.commit?.hash
        },
        repository: {
          name: repositoryName,
          fullName: `${this.workspace}/${repositoryName}`
        },
        createdOn: pr.created_on,
        updatedOn: pr.updated_on,
        mergedOn: pr.merge_commit?.date,
        commentCount: pr.comment_count || 0,
        taskCount: pr.task_count || 0,
        approvalCount: pr.participants?.filter(p => p.approved).length || 0,
        reviewerCount: pr.reviewers?.length || 0,
        participants: pr.participants?.map(p => ({
          username: p.user?.username,
          displayName: p.user?.display_name,
          role: p.role,
          approved: p.approved,
          participatedOn: p.participated_on
        })) || [],
        links: {
          html: pr.links?.html?.href,
          diff: pr.links?.diff?.href,
          commits: pr.links?.commits?.href
        },
        closeSourceBranch: pr.close_source_branch,
        closedBy: pr.closed_by ? {
          username: pr.closed_by.username,
          displayName: pr.closed_by.display_name
        } : null,
        reason: pr.reason,
        // Additional calculated fields
        daysSinceCreated: Math.floor((new Date() - new Date(pr.created_on)) / (1000 * 60 * 60 * 24)),
        daysSinceUpdated: Math.floor((new Date() - new Date(pr.updated_on)) / (1000 * 60 * 60 * 24)),
        isStale: Math.floor((new Date() - new Date(pr.updated_on)) / (1000 * 60 * 60 * 24)) > 7,
        needsReview: pr.state === 'OPEN' && (pr.participants?.filter(p => p.approved).length || 0) === 0,
        hasConflicts: pr.task_count > 0 // Assuming tasks indicate conflicts or issues
      }));

    } catch (error) {
      console.error(`Error fetching PRs for repository ${repositoryName}:`, error.message);
      return [];
    }
  }

  /**
   * Get detailed information for a specific PR
   */
  async getPRDetails(repositoryName, prId) {
    try {
      const [commentsResponse, commitsResponse, diffstatResponse] = await Promise.allSettled([
        this.client.get(`/repositories/${this.workspace}/${repositoryName}/pullrequests/${prId}/comments`),
        this.client.get(`/repositories/${this.workspace}/${repositoryName}/pullrequests/${prId}/commits`),
        this.client.get(`/repositories/${this.workspace}/${repositoryName}/pullrequests/${prId}/diffstat`)
      ]);

      const comments = commentsResponse.status === 'fulfilled' ? commentsResponse.value.data.values || [] : [];
      const commits = commitsResponse.status === 'fulfilled' ? commitsResponse.value.data.values || [] : [];
      const diffstat = diffstatResponse.status === 'fulfilled' ? diffstatResponse.value.data.values || [] : [];

      return {
        detailedComments: comments.map(comment => ({
          id: comment.id,
          content: comment.content?.raw,
          author: comment.user?.display_name,
          createdOn: comment.created_on,
          updatedOn: comment.updated_on,
          isDeleted: comment.deleted
        })),
        commits: commits.map(commit => ({
          hash: commit.hash,
          message: commit.message,
          author: commit.author?.user?.display_name,
          date: commit.date
        })),
        filesChanged: diffstat.length,
        linesAdded: diffstat.reduce((sum, file) => sum + (file.lines_added || 0), 0),
        linesRemoved: diffstat.reduce((sum, file) => sum + (file.lines_removed || 0), 0),
        diffstat: diffstat.map(file => ({
          file: file.new?.path || file.old?.path,
          status: file.status,
          linesAdded: file.lines_added || 0,
          linesRemoved: file.lines_removed || 0
        }))
      };

    } catch (error) {
      console.warn(`Error fetching PR details for ${prId}:`, error.message);
      return {};
    }
  }

  /**
   * Get team member's recent PR activity
   */
  async getTeamMemberPRActivity(teamMemberName, days = 7) {
    try {
      console.log(`Fetching recent PR activity for ${teamMemberName} (last ${days} days)`);
      
      if (!this.workspace || !this.appPassword) {
        return {
          createdPRs: [],
          reviewedPRs: [],
          mergedPRs: []
        };
      }

      const allPRs = await this.getPRStatus(teamMemberName);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const recentPRs = allPRs.filter(pr => new Date(pr.updatedOn) >= cutoffDate);

      return {
        createdPRs: recentPRs.filter(pr => pr.author.username === teamMemberName),
        reviewedPRs: recentPRs.filter(pr => 
          pr.participants.some(p => p.username === teamMemberName && p.approved)
        ),
        mergedPRs: recentPRs.filter(pr => 
          pr.state === 'MERGED' && pr.author.username === teamMemberName
        ),
        totalActivity: recentPRs.length
      };

    } catch (error) {
      console.error('Error fetching team member PR activity:', error.message);
      return {
        createdPRs: [],
        reviewedPRs: [],
        mergedPRs: [],
        totalActivity: 0
      };
    }
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(repositoryName) {
    try {
      console.log(`Fetching repository statistics for ${repositoryName}`);
      
      if (!this.workspace || !this.appPassword) {
        return null;
      }

      const [repoResponse, prsResponse, branchesResponse] = await Promise.allSettled([
        this.client.get(`/repositories/${this.workspace}/${repositoryName}`),
        this.client.get(`/repositories/${this.workspace}/${repositoryName}/pullrequests`, {
          params: { pagelen: 100, state: 'OPEN,MERGED,DECLINED' }
        }),
        this.client.get(`/repositories/${this.workspace}/${repositoryName}/refs/branches`, {
          params: { pagelen: 50 }
        })
      ]);

      const repo = repoResponse.status === 'fulfilled' ? repoResponse.value.data : null;
      const prs = prsResponse.status === 'fulfilled' ? prsResponse.value.data.values || [] : [];
      const branches = branchesResponse.status === 'fulfilled' ? branchesResponse.value.data.values || [] : [];

      if (!repo) {
        return null;
      }

      const openPRs = prs.filter(pr => pr.state === 'OPEN');
      const mergedPRs = prs.filter(pr => pr.state === 'MERGED');
      const declinedPRs = prs.filter(pr => pr.state === 'DECLINED');

      return {
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        size: repo.size,
        isPrivate: repo.is_private,
        createdOn: repo.created_on,
        updatedOn: repo.updated_on,
        url: repo.links?.html?.href,
        statistics: {
          totalPRs: prs.length,
          openPRs: openPRs.length,
          mergedPRs: mergedPRs.length,
          declinedPRs: declinedPRs.length,
          totalBranches: branches.length,
          averagePRAge: this.calculateAveragePRAge(openPRs),
          stalePRs: openPRs.filter(pr => 
            Math.floor((new Date() - new Date(pr.updated_on)) / (1000 * 60 * 60 * 24)) > 7
          ).length
        }
      };

    } catch (error) {
      console.error(`Error fetching repository stats for ${repositoryName}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate average age of PRs in days
   */
  calculateAveragePRAge(prs) {
    if (prs.length === 0) return 0;
    
    const totalAge = prs.reduce((sum, pr) => {
      const age = Math.floor((new Date() - new Date(pr.created_on)) / (1000 * 60 * 60 * 24));
      return sum + age;
    }, 0);
    
    return Math.round(totalAge / prs.length);
  }

  /**
   * Get team PR workload distribution
   */
  async getTeamPRWorkload(teamMembers) {
    try {
      console.log('Calculating team PR workload distribution');
      
      if (!this.workspace || !this.appPassword || !teamMembers || teamMembers.length === 0) {
        return {};
      }

      const workload = {};
      
      for (const member of teamMembers) {
        const prs = await this.getPRStatus(member);
        const openPRs = prs.filter(pr => pr.state === 'OPEN');
        const needsReview = openPRs.filter(pr => pr.needsReview);
        const stalePRs = openPRs.filter(pr => pr.isStale);
        
        workload[member] = {
          totalPRs: prs.length,
          openPRs: openPRs.length,
          mergedPRs: prs.filter(pr => pr.state === 'MERGED').length,
          needsReview: needsReview.length,
          stalePRs: stalePRs.length,
          averageComments: prs.length > 0 ? Math.round(prs.reduce((sum, pr) => sum + pr.commentCount, 0) / prs.length) : 0,
          recentPRs: prs.slice(0, 3) // Top 3 most recent PRs
        };
      }

      return workload;

    } catch (error) {
      console.error('Error calculating team PR workload:', error.message);
      return {};
    }
  }
}

// Create singleton instance
const bitbucketService = new BitbucketService();

// Export functions for backward compatibility
module.exports = {
  getPRStatus: (teamMemberName) => bitbucketService.getPRStatus(teamMemberName),
  getRepositoryPRs: (repositoryName, authorName) => bitbucketService.getRepositoryPRs(repositoryName, authorName),
  getPRDetails: (repositoryName, prId) => bitbucketService.getPRDetails(repositoryName, prId),
  getTeamMemberPRActivity: (teamMemberName, days) => bitbucketService.getTeamMemberPRActivity(teamMemberName, days),
  getRepositoryStats: (repositoryName) => bitbucketService.getRepositoryStats(repositoryName),
  getTeamPRWorkload: (teamMembers) => bitbucketService.getTeamPRWorkload(teamMembers),
  getWorkspaceRepositories: () => bitbucketService.getWorkspaceRepositories(),
  bitbucketService
};
