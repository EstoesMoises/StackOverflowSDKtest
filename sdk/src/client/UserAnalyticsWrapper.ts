// User Analytics Wrapper Method
import { BaseClient } from './shared';
import { UserAnalyticsResponseModel } from '../generated/index.js';

/**
 * Fetch user analytics data.
 * @param userId - The ID of the user to fetch analytics for.
 * @returns Promise<UserAnalyticsResponseModel>
 */
export async function fetchUserAnalytics(userId: string): Promise<UserAnalyticsResponseModel> {
  try {
    const response = await BaseClient.get(`/analytics/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    throw new Error('Failed to fetch user analytics');
  }
}