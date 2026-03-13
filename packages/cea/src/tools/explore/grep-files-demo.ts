/**
 * Demonstration: Using the grep_files tool
 *
 * This file shows how to use the grep_files tool for searching file contents.
 *
 * ## Usage Examples
 *
 * ### 1. Basic Search - Find function definitions
 *
 * ```typescript
 * import { executeGrep } from "./grep";
 *
 * // Search for all occurrences of "function" in current directory
 * const result = await executeGrep({
 *   pattern: "function",
 *   path: "./src",
 * });
 * // Output: file paths with hashline anchors like:
 * // "src/utils.ts:5#AB|function foo() {}"
 * ```
 *
 * ### 2. Filter by file type (include)
 *
 * ```typescript
 * // Only search in TypeScript files
 * const tsResults = await executeGrep({
 *   pattern: "async",
 *   path: "./src",
 *   include: "*.ts",
 * });
 * ```
 *
 * ### 3. Case-sensitive search
 *
 * ```typescript
 * // Exact case matching
 * const exactMatch = await executeGrep({
 *   pattern: "MyClass",
 *   path: "./src",
 *   case_sensitive: true,
 * });
 * ```
 *
 * ### 4. Fixed string (no regex)
 *
 * ```typescript
 * // Treat pattern as literal string, not regex
 * const literal = await executeGrep({
 *   pattern: "*.ts",  // This would be interpreted as regex without fixed_strings
 *   path: "./src",
 *   fixed_strings: true,
 * });
 * ```
 *
 * ### 5. Context lines (before/after)
 *
 * ```typescript
 * // Get surrounding context
 * const withContext = await executeGrep({
 *   pattern: "error",
 *   path: "./src",
 *   before: 2,  // 2 lines before match
 *   after: 3,   // 3 lines after match
 * });
 * ```
 *
 * ## Output Format
 *
 * The grep_files tool returns output in this format:
 *
 * ```
 * OK - grep
 * pattern: "foo"
 * path: /path/to/search
 * include: *.ts
 * match_count: 5
 * truncated: false
 * ======== grep results ========
 * src/file1.ts:1#AB|const foo = 1;
 * src/file2.ts:3#CD|function foo() {}
 * src/file2.ts:7#EF|const foo = 'bar';
 * ======== end ========
 * ```
 *
 * Each match line contains:
 * - File path
 * - Line number (e.g., `:1`)
 * - Hashline anchor (e.g., `#AB`) - used for edit_file operations
 * - Line content (e.g., `|const foo = 1;`)
 *
 * ## Hashline Anchor Usage
 *
 * The hashline anchor `{line_number}#{hash_id}` can be used directly with
 * the edit_file tool for precise editing:
 *
 * ```typescript
 * // Use the anchor from grep result to edit
 * edit_file({
 *   path: "src/file1.ts",
 *   edits: [
 *     { op: "replace", pos: "1#AB", lines: ["const foo = 42;"] }
 *   ]
 * });
 * ```
 *
 * ## Tool Definition
 *
 * The grep_files tool is defined in:
 * - Implementation: src/tools/explore/grep.ts
 * - Tests: src/tools/explore/grep.test.ts
 * - Description: src/tools/explore/grep-files.txt
 */
