import { BaseClient } from './shared/base';
import { QuestionsMain2123121312312321Api } from '../apis/QuestionsMain2123121312312321Api';

export class QuestionClient extends BaseClient {
  private mainApi: QuestionsMain2123121312312321Api;

  /**
   * Creates a new QuestionClient instance
   *
   * @param {ReturnType<typeof createConfiguration>} configuration - The configuration object
   */
  constructor(configuration: ReturnType<typeof createConfiguration>) {
    super(configuration);
    this.mainApi = new QuestionsMain2123121312312321Api(configuration);
  }

  /**
   * Fetches a list of questions
   *
   * @returns {Promise<Question[]>} A promise that resolves to a list of questions
   */
  async getQuestions(): Promise<Question[]> {
    try {
      const response = await this.mainApi.getQuestions();
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }
}