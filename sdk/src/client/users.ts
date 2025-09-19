import { UsersMainApi, UsersTeamsApi } from '../apis';
import { UserAnalyticsResponseModel } from '../models/UserAnalyticsResponseModel';

export class UserClient extends BaseClient {
  private mainApi: UsersMainApi;
  private teamsApi?: UsersTeamsApi;

  constructor(apiClient: ReturnType<typeof createApiClient>) {
    super(apiClient);
    this.mainApi = new UsersMainApi(apiClient);
    this.teamsApi = new UsersTeamsApi(apiClient);
  }

  /**
   * Fetch user analytics data
   * @param {string} userId - The ID of the user
   * @returns {Promise<UserAnalyticsResponseModel>} - The user analytics data
   */
  public async getUserAnalytics(userId: string): Promise<UserAnalyticsResponseModel> {
    try {
      const response = await this.mainApi.getUserAnalytics({ userId });
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  // Existing methods...
}