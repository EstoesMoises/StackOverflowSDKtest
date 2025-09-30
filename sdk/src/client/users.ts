// src/client/users.ts
import { BaseClient } from './shared';
import { UsersMainApi, UserAnalyticsResponseModel } from '../generated/index.js';

/**
 * Fetch user analytics data
 * @returns {Promise<UserAnalyticsResponseModel>} The user analytics data
 */
export async function fetchUserAnalytics(): Promise<UserAnalyticsResponseModel> {
  try {
    const response = await UsersMainApi.getUserAnalytics();
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch user analytics: ${error.message}`);
  }
}

// src/client/questions.ts
import { BaseClient } from './shared';
import { QuestionsMainApi } from '../generated/index.js';

/**
 * Fetch all questions
 * @returns {Promise<QuestionResponseModel[]>} List of questions
 */
export async function fetchAllQuestions(): Promise<QuestionResponseModel[]> {
  try {
    const response = await QuestionsMainApi.getAllQuestions();
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch questions: ${error.message}`);
  }
}