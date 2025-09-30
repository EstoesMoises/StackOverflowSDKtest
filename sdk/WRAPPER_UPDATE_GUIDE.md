# Wrapper Update Guide

**Generated:** 2025-09-30T19:02:55.925Z
**Risk Level:** `LOW`

## 📋 Summary

The SDK has been updated with new user analytics functionality. A new model `UserAnalyticsResponseModel` was added, and significant changes were made to the Users APIs (both Main and Teams variants) with approximately 5,400 bytes of new code added across the user-related endpoints. The Questions API also received substantial updates with about 6,800 bytes of new functionality.

## 🔄 Migration Steps

1. 1. Examine the generated UsersMainApi and UsersTeamsApi files to identify new analytics-related methods
2. 2. Add corresponding wrapper methods to users.ts following the established pattern
3. 3. Review QuestionsMainApi for new functionality and add appropriate wrapper methods to questions.ts
4. 4. Update shared/types.ts to export UserAnalyticsResponseModel
5. 5. Test new analytics methods with both main API and teams API configurations
6. 6. Update documentation and examples to showcase new analytics capabilities

## 📝 Files to Update

### 🟠 MODIFY: `src/client/users.ts`

**Priority:** HIGH

**Why:** Users API received significant enhancements (~5,400 bytes) that likely include analytics functionality that should be made available to SDK users.

**Instructions:**
Add new analytics methods to the UserClient class. The generated APIs now include analytics endpoints that should be exposed through wrapper methods.

**Example:**
```typescript
// Add analytics methods to UserClient class
async getUserAnalytics(userId: number): Promise<UserAnalyticsResponseModel> {
  return this.handleApiCall(async () => {
    if (this.teamId && this.teamsApi) {
      return await this.teamsApi.teamsTeamUsersUserIdAnalyticsGet(userId, this.teamId);
    }
    return await this.mainApi.usersUserIdAnalyticsGet(userId);
  }, 'getUserAnalytics');
}

async getCurrentUserAnalytics(): Promise<UserAnalyticsResponseModel> {
  const currentUser = await this.getCurrentUser();
  if (!currentUser.id) {
    throw new Error('Current user ID not available');
  }
  return this.getUserAnalytics(currentUser.id);
}
```

---

### 🟠 MODIFY: `src/client/questions.ts`

**Priority:** HIGH

**Why:** Questions API received substantial updates that likely include new management or analytics capabilities.

**Instructions:**
Review and add any new question management methods that were added to QuestionsMainApi. The API received ~6,800 bytes of new functionality that may include new endpoints.

**Example:**
```typescript
// Example pattern for new question methods
async getQuestionAnalytics(questionId: number): Promise<any> {
  return this.handleApiCall(async () => {
    if (this.teamId && this.teamsApi) {
      return await this.teamsApi.teamsTeamQuestionsQuestionIdAnalyticsGet(questionId, this.teamId);
    }
    return await this.mainApi.questionsQuestionIdAnalyticsGet(questionId);
  }, 'getQuestionAnalytics');
}
```

---

### 🟡 MODIFY: `src/client/shared/types.ts`

**Priority:** MEDIUM

**Why:** New model should be accessible through the shared types interface.

**Instructions:**
Add import and re-export for the new UserAnalyticsResponseModel to make it available to wrapper consumers.

**Example:**
```typescript
// Add to imports
export { UserAnalyticsResponseModel } from '../../generated/index.js';

// Or add to existing export block
export {
  // existing exports...
  UserAnalyticsResponseModel
} from '../../generated/index.js';
```

---

### 🟢 REVIEW: `src/client/index.ts`

**Priority:** LOW

**Why:** Main entry point should expose new public types and models.

**Instructions:**
Review the main index.ts file to ensure any new types or models are properly re-exported if they should be part of the public API.

**Example:**
```typescript
// Add to existing exports if needed
export { UserAnalyticsResponseModel } from './generated/index.js';
// or
export type { UserAnalyticsResponseModel } from './generated/index.js';
```

---

## ✨ New Endpoints to Wrap

### GET User Analytics

**Generated SDK:** `apis/UsersMainApi.ts and apis/UsersTeamsApi.ts`
**Wrapper file:** `src/client/users.ts`
**Suggested method:** `getUserAnalytics`

**Example implementation:**
```typescript
async getUserAnalytics(userId: number): Promise<UserAnalyticsResponseModel> {
  return this.handleApiCall(async () => {
    if (this.teamId && this.teamsApi) {
      return await this.teamsApi.teamsTeamUsersUserIdAnalyticsGet(userId, this.teamId);
    }
    return await this.mainApi.usersUserIdAnalyticsGet(userId);
  }, 'getUserAnalytics');
}
```

---

### Various Enhanced Question Management

**Generated SDK:** `apis/QuestionsMainApi.ts`
**Wrapper file:** `src/client/questions.ts`
**Suggested method:** `Various analytics/management methods`

**Example implementation:**
```typescript
// Pattern for new question methods
async getQuestionMetrics(questionId: number): Promise<any> {
  return this.handleApiCall(async () => {
    if (this.teamId && this.teamsApi) {
      return await this.teamsApi.newQuestionMethod(questionId, this.teamId);
    }
    return await this.mainApi.newQuestionMethod(questionId);
  }, 'getQuestionMetrics');
}
```

---

## ⚠️ Compatibility Notes

- All changes are additive - no existing wrapper methods need modification
- New UserAnalyticsResponseModel is purely additive and won't affect existing code
- Enhanced APIs maintain backward compatibility with existing wrapper implementations
- Teams API variants follow the same patterns as existing team-scoped methods

## 🧪 Testing Checklist

- [ ] Test new user analytics methods with valid user IDs to ensure proper data retrieval
- [ ] Verify analytics methods work correctly in both main API and teams API contexts
- [ ] Test getCurrentUserAnalytics() method with authenticated users
- [ ] Validate that new question management methods function properly
- [ ] Ensure UserAnalyticsResponseModel is properly typed and accessible
- [ ] Test error handling for analytics methods with invalid user IDs
- [ ] Verify that existing wrapper functionality remains unaffected
- [ ] Test team-scoped analytics methods with valid team IDs

## 📊 Detailed Impact

### Added Endpoints
- User analytics endpoints in UsersMainApi and UsersTeamsApi
- Enhanced question management endpoints in QuestionsMainApi
- New analytics-related methods across user APIs

### Modified Endpoints
- UsersMainApi - enhanced with analytics capabilities
- UsersTeamsApi - enhanced with analytics capabilities
- QuestionsMainApi - expanded functionality

