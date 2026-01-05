import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";
import { trimLeadingNewlinesMiddleware } from "../middleware/trim-leading-newlines";

export function wrapModel(model: LanguageModel): LanguageModel {
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: trimLeadingNewlinesMiddleware,
  });
}
