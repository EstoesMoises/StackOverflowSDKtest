import { BaseClient } from './shared/base';
import { QuestionsMain2123121312312321Api } from '../apis/QuestionsMain2123121312312321Api';
import { Question, NewQuestion } from './shared/types';

export class QuestionsClient extends BaseClient {
  private mainApi: QuestionsMain2123121312312321Api;

  constructor(configuration: ReturnType<typeof createConfiguration>) {
    super(configuration);
    this.mainApi = new QuestionsMain2123121312312321Api(configuration);
  }

  async fetchQuestions(): Promise<Question[]> {
    try {
      const response = await this.mainApi.getQuestions();
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async submitQuestion(question: NewQuestion): Promise<Question> {
    try {
      const response = await this.mainApi.createQuestion(question);
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }
}