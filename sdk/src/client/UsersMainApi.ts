// UsersMainApi.ts

import { BaseClient } from './shared';
import { UserAnalyticsResponseModel } from '../generated/index.js';

/**
 * Fetch user analytics data
 * @param userId - The ID of the user to fetch analytics for
 * @returns {Promise<UserAnalyticsResponseModel>} - The user analytics data
 * @throws {Error} - Throws an error if the request fails
 */
export async function fetchUserAnalytics(userId: string): Promise<UserAnalyticsResponseModel> {
    try {
        const response = await BaseClient.get(`/users/${userId}/analytics`);
        return response.data;
    } catch (error) {
        throw new Error(`Failed to fetch user analytics: ${error.message}`);
    }
}