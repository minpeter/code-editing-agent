import type { LanguageModelV4Middleware } from "@ai-sdk/provider";
import {
  hermesToolMiddleware,
  morphXmlToolMiddleware,
  qwen3CoderToolMiddleware,
} from "@ai-sdk-tool/parser";
import type { LanguageModelMiddleware } from "ai";
import type { ToolFallbackMode } from "../tool-fallback-mode";
import { trimLeadingNewlinesMiddleware as trimMiddleware } from "./trim-leading-newlines";

export interface MiddlewareOptions {
  toolFallbackMode: ToolFallbackMode;
}

/**
 * Parser/tool middlewares are LanguageModelV4Middleware; ai@6 wrapLanguageModel
 * still types its parameter as LanguageModelV3Middleware. Runtime only uses the
 * hook functions, so we cast at the boundary.
 */
const TOOL_FALLBACK_MIDDLEWARES: Readonly<
  Record<Exclude<ToolFallbackMode, "disable">, LanguageModelV4Middleware>
> = {
  morphxml: morphXmlToolMiddleware,
  hermes: hermesToolMiddleware,
  qwen3coder: qwen3CoderToolMiddleware,
};

export function buildMiddlewares(
  options: MiddlewareOptions
): LanguageModelMiddleware[] {
  const middlewares: LanguageModelV4Middleware[] = [trimMiddleware];

  if (options.toolFallbackMode !== "disable") {
    middlewares.push(TOOL_FALLBACK_MIDDLEWARES[options.toolFallbackMode]);
  }

  return middlewares as unknown as LanguageModelMiddleware[];
}
