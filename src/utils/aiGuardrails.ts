import { STATIC_REFUSAL_MESSAGE } from "../prompts/adminChatbotPrompt";

// Client-side regex for instant rejection of non-motorcycle keywords
const OFF_TOPIC_REGEX = /\b(cooking|recipe|adobo|food|programming|python|react|javascript|code|movie|actor|crypto|bitcoin|election|politics|nba|football|homework|essay)\b/i;

export const checkIsOffTopic = (query: string): boolean => {
  return OFF_TOPIC_REGEX.test(query);
};

export { STATIC_REFUSAL_MESSAGE };