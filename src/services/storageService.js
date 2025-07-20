const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs-extra');
const path = require('path');
const csvWriter = require('csv-writer');
const csv = require('csv-parser');

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'standup-tracker-storage';
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'both'; // json, csv, or both

/**
 * Save standup data in the configured format(s)
 */
async function saveStandupData(standupRecord) {
  console.log(`Saving standup data with storage type: ${STORAGE_TYPE}`);
  
  const promises = [];
  
  if (STORAGE_TYPE === 'json' || STORAGE_TYPE === 'both') {
    promises.push(saveAsJSON(standupRecord));
  }
  
  if (STORAGE_TYPE === 'csv' || STORAGE_TYPE === 'both') {
    promises.push(saveAsCSV(standupRecord));
  }
  
  await Promise.all(promises);
  console.log('Standup data saved successfully');
}

/**
 * Save data as JSON format
 */
async function saveAsJSON(standupRecord) {
  try {
    const fileName = `standups/json/${standupRecord.teamMemberName}/${new Date().toISOString().split('T')[0]}.json`;
    
    // Get existing data for the day
    let dayData = [];
    try {
      const existingData = await getObjectFromS3(fileName);
      if (existingData) {
        dayData = JSON.parse(existingData);
      }
    } catch (error) {
      // File doesn't exist, start with empty array
      console.log('Creating new JSON file for the day');
    }
    
    // Add new record
    dayData.push(standupRecord);
    
    // Save to S3
    await putObjectToS3(fileName, JSON.stringify(dayData, null, 2));
    
    // Also save individual record with timestamp
    const individualFileName = `standups/json/${standupRecord.teamMemberName}/${standupRecord.id}.json`;
    await putObjectToS3(individualFileName, JSON.stringify(standupRecord, null, 2));
    
    console.log(`JSON data saved: ${fileName}`);
    
  } catch (error) {
    console.error('Error saving JSON data:', error);
    throw error;
  }
}

/**
 * Save data as CSV format
 */
async function saveAsCSV(standupRecord) {
  try {
    const fileName = `standups/csv/${standupRecord.teamMemberName}/${new Date().toISOString().split('T')[0]}.csv`;
    
    // Flatten the record for CSV
    const flatRecord = flattenStandupRecord(standupRecord);
    
    // Check if file exists to determine if we need headers
    let existingData = '';
    let needsHeader = true;
    
    try {
      existingData = await getObjectFromS3(fileName);
      needsHeader = !existingData || existingData.trim() === '';
    } catch (error) {
      // File doesn't exist, we'll need headers
      needsHeader = true;
    }
    
    // Create CSV content
    let csvContent = existingData || '';
    
    if (needsHeader) {
      const headers = Object.keys(flatRecord).join(',');
      csvContent = headers + '\n';
    }
    
    const values = Object.values(flatRecord).map(value => {
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
    
    csvContent += values + '\n';
    
    // Save to S3
    await putObjectToS3(fileName, csvContent);
    
    console.log(`CSV data saved: ${fileName}`);
    
  } catch (error) {
    console.error('Error saving CSV data:', error);
    throw error;
  }
}

/**
 * Flatten standup record for CSV format
 */
function flattenStandupRecord(record) {
  const flattened = {
    id: record.id,
    teamMemberName: record.teamMemberName,
    timestamp: record.timestamp,
    yesterday: record.yesterday,
    today: record.today,
    blockers: record.blockers,
    jiraTasksCount: record.jiraTasks ? record.jiraTasks.length : 0,
    bitbucketPRsCount: record.bitbucketPRs ? record.bitbucketPRs.length : 0,
    openPRsCount: record.bitbucketPRs ? record.bitbucketPRs.filter(pr => pr.state === 'OPEN').length : 0,
    followUpQuestionsCount: record.followUpQuestions ? record.followUpQuestions.length : 0,
    previousUpdatesCount: record.previousUpdatesCount || 0
  };
  
  // Add Jira task details
  if (record.jiraTasks && record.jiraTasks.length > 0) {
    flattened.jiraTaskKeys = record.jiraTasks.map(task => task.key).join(';');
    flattened.jiraTaskStatuses = record.jiraTasks.map(task => task.fields?.status?.name || 'Unknown').join(';');
  }
  
  // Add PR details
  if (record.bitbucketPRs && record.bitbucketPRs.length > 0) {
    flattened.prTitles = record.bitbucketPRs.map(pr => pr.title).join(';');
    flattened.prStates = record.bitbucketPRs.map(pr => pr.state).join(';');
    flattened.prCommentCounts = record.bitbucketPRs.map(pr => pr.comment_count || 0).join(';');
  }
  
  // Add follow-up questions
  if (record.followUpQuestions && record.followUpQuestions.length > 0) {
    flattened.followUpQuestions = record.followUpQuestions.join(';');
  }
  
  return flattened;
}

/**
 * Get previous updates for a team member
 */
async function getPreviousUpdates(teamMemberName, limit = 10) {
  try {
    console.log(`Retrieving previous updates for ${teamMemberName}`);
    
    const prefix = `standups/json/${teamMemberName}/`;
    const objects = await listObjectsFromS3(prefix);
    
    if (!objects || objects.length === 0) {
      return [];
    }
    
    // Sort by last modified date (most recent first)
    objects.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
    
    const updates = [];
    
    // Get the most recent files up to the limit
    for (let i = 0; i < Math.min(objects.length, limit); i++) {
      try {
        const data = await getObjectFromS3(objects[i].Key);
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            updates.push(...parsed);
          } else {
            updates.push(parsed);
          }
        }
      } catch (parseError) {
        console.warn(`Error parsing file ${objects[i].Key}:`, parseError);
      }
    }
    
    // Sort by timestamp (most recent first) and limit results
    return updates
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
  } catch (error) {
    console.error('Error retrieving previous updates:', error);
    return [];
  }
}

/**
 * Get standup history for a team member with date range
 */
async function getStandupHistory(teamMemberName, startDate, endDate, format = 'json') {
  try {
    console.log(`Retrieving standup history for ${teamMemberName} from ${startDate} to ${endDate}`);
    
    const prefix = `standups/${format}/${teamMemberName}/`;
    const objects = await listObjectsFromS3(prefix);
    
    if (!objects || objects.length === 0) {
      return [];
    }
    
    // Filter objects by date range if provided
    let filteredObjects = objects;
    if (startDate || endDate) {
      filteredObjects = objects.filter(obj => {
        const fileName = obj.Key.split('/').pop();
        const fileDate = fileName.replace(/\.(json|csv)$/, '');
        
        if (startDate && fileDate < startDate) return false;
        if (endDate && fileDate > endDate) return false;
        
        return true;
      });
    }
    
    const history = [];
    
    for (const obj of filteredObjects) {
      try {
        const data = await getObjectFromS3(obj.Key);
        if (data) {
          if (format === 'json') {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              history.push(...parsed);
            } else {
              history.push(parsed);
            }
          } else {
            // For CSV, return raw data
            history.push({
              date: obj.Key.split('/').pop().replace('.csv', ''),
              data: data
            });
          }
        }
      } catch (parseError) {
        console.warn(`Error parsing file ${obj.Key}:`, parseError);
      }
    }
    
    return history;
    
  } catch (error) {
    console.error('Error retrieving standup history:', error);
    return [];
  }
}

/**
 * Get team statistics and metrics
 */
async function getTeamMetrics(startDate, endDate) {
  try {
    console.log('Calculating team metrics...');
    
    const prefix = 'standups/json/';
    const objects = await listObjectsFromS3(prefix);
    
    if (!objects || objects.length === 0) {
      return {
        totalStandups: 0,
        activeMembers: 0,
        averageTasksPerMember: 0,
        averagePRsPerMember: 0,
        topBlockers: []
      };
    }
    
    const allStandups = [];
    const memberStats = {};
    const blockerFrequency = {};
    
    for (const obj of objects) {
      try {
        const data = await getObjectFromS3(obj.Key);
        if (data) {
          const parsed = JSON.parse(data);
          const standups = Array.isArray(parsed) ? parsed : [parsed];
          
          for (const standup of standups) {
            // Filter by date range if provided
            if (startDate && standup.timestamp < startDate) continue;
            if (endDate && standup.timestamp > endDate) continue;
            
            allStandups.push(standup);
            
            // Track member stats
            if (!memberStats[standup.teamMemberName]) {
              memberStats[standup.teamMemberName] = {
                standupCount: 0,
                totalTasks: 0,
                totalPRs: 0,
                blockers: []
              };
            }
            
            const stats = memberStats[standup.teamMemberName];
            stats.standupCount++;
            stats.totalTasks += standup.jiraTasks ? standup.jiraTasks.length : 0;
            stats.totalPRs += standup.bitbucketPRs ? standup.bitbucketPRs.length : 0;
            
            // Track blockers
            if (standup.blockers && standup.blockers.toLowerCase() !== 'none') {
              stats.blockers.push(standup.blockers);
              
              // Simple blocker frequency tracking
              const blockerKey = standup.blockers.toLowerCase().substring(0, 50);
              blockerFrequency[blockerKey] = (blockerFrequency[blockerKey] || 0) + 1;
            }
          }
        }
      } catch (parseError) {
        console.warn(`Error parsing file ${obj.Key}:`, parseError);
      }
    }
    
    // Calculate metrics
    const activeMembers = Object.keys(memberStats).length;
    const totalTasks = Object.values(memberStats).reduce((sum, stats) => sum + stats.totalTasks, 0);
    const totalPRs = Object.values(memberStats).reduce((sum, stats) => sum + stats.totalPRs, 0);
    
    // Get top blockers
    const topBlockers = Object.entries(blockerFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([blocker, count]) => ({ blocker, count }));
    
    return {
      totalStandups: allStandups.length,
      activeMembers,
      averageTasksPerMember: activeMembers > 0 ? Math.round(totalTasks / activeMembers * 100) / 100 : 0,
      averagePRsPerMember: activeMembers > 0 ? Math.round(totalPRs / activeMembers * 100) / 100 : 0,
      topBlockers,
      memberStats
    };
    
  } catch (error) {
    console.error('Error calculating team metrics:', error);
    return {
      totalStandups: 0,
      activeMembers: 0,
      averageTasksPerMember: 0,
      averagePRsPerMember: 0,
      topBlockers: [],
      error: error.message
    };
  }
}

/**
 * S3 Helper Functions
 */
async function getObjectFromS3(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    const response = await s3Client.send(command);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks).toString('utf-8');
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

async function putObjectToS3(key, data) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: data,
    ContentType: key.endsWith('.json') ? 'application/json' : 'text/csv'
  });
  
  return await s3Client.send(command);
}

async function listObjectsFromS3(prefix) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    });
    
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('Error listing objects from S3:', error);
    return [];
  }
}

module.exports = {
  saveStandupData,
  getPreviousUpdates,
  getStandupHistory,
  getTeamMetrics
};
