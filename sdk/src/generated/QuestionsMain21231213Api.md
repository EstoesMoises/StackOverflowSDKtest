# .QuestionsMain21231213Api

All URIs are relative to *https://support-autotest.stackenterprise.co/api/v3*

Method | HTTP request | Description
------------- | ------------- | -------------
[**questionsGet**](QuestionsMain21231213Api.md#questionsGet) | **GET** /questions | Retrieve all questions


# **questionsGet**
> PaginatedQuestions questionsGet()

Retrieves all questions on the site or team.

### Example


```typescript
import { createConfiguration, QuestionsMain21231213Api } from '';
import type { QuestionsMain21231213ApiQuestionsGetRequest } from '';

const configuration = createConfiguration();
const apiInstance = new QuestionsMain21231213Api(configuration);

const request: QuestionsMain21231213ApiQuestionsGetRequest = {
  
  page: 1,
  
  pageSize: 15,
  
  sort: "activity",
  
  order: "asc",
  
  isAnswered: true,
  
  hasAcceptedAnswer: true,
  
  questionId: [
    1,
  ],
  
  tagId: [
    1,
  ],
  
  authorId: 1,
  
  _from: new Date('1970-01-01T00:00:00.00Z'),
  
  to: new Date('1970-01-01T00:00:00.00Z'),
};

const data = await apiInstance.questionsGet(request);
console.log('API called successfully. Returned data:', data);
```


### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **page** | [**number**] |  | (optional) defaults to undefined
 **pageSize** | [**15 | 30 | 50 | 100**]**Array<15 &#124; 30 &#124; 50 &#124; 100>** |  | (optional) defaults to undefined
 **sort** | **QuestionSortParameter** |  | (optional) defaults to undefined
 **order** | **SortOrder** |  | (optional) defaults to undefined
 **isAnswered** | [**boolean**] |  | (optional) defaults to undefined
 **hasAcceptedAnswer** | [**boolean**] |  | (optional) defaults to undefined
 **questionId** | **Array&lt;number&gt;** |  | (optional) defaults to undefined
 **tagId** | **Array&lt;number&gt;** |  | (optional) defaults to undefined
 **authorId** | [**number**] |  | (optional) defaults to undefined
 **_from** | [**Date**] |  | (optional) defaults to undefined
 **to** | [**Date**] |  | (optional) defaults to undefined


### Return type

**PaginatedQuestions**

### Authorization

[oauth2](README.md#oauth2)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json, text/plain


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Questions found |  -  |
**400** | Invalid request |  -  |
**401** | Unauthorized |  -  |
**403** | Forbidden |  -  |

[[Back to top]](#) [[Back to API list]](README.md#documentation-for-api-endpoints) [[Back to Model list]](README.md#documentation-for-models) [[Back to README]](README.md)


