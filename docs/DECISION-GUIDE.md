# Decision Guide

이 문서는 `plugsuits` 에코시스템에서 특정 API나 설계를 선택할 때의 기준을 제공합니다.

## `runHeadless` vs `runAgentLoop`

어떤 실행 루프를 사용할지는 사용 사례에 따라 달라집니다.

| 특징 | `runHeadless` (@ai-sdk-tool/headless) | `runAgentLoop` (@ai-sdk-tool/harness) |
| :--- | :--- | :--- |
| **주요 목적** | 자동화, 벤치마크, CI/CD | 대화형 봇, CLI, 커스텀 루프 제어 |
| **출력 방식** | ATIF v1.6 규격 JSONL 이벤트 스트림 | 가공되지 않은 메시지 배열 및 훅 |
| **상태 관리** | 내부에서 체크포인트 및 세션 자동 관리 | 사용자가 메시지 배열 직접 관리 |
| **메모리 추출** | 배경 작업으로 메모리 추출 지원 | 수동으로 구현 필요 |
| **복잡도** | 높음 (설정할 것이 많음) | 낮음 (직관적인 루프) |

**요약:** 
- 프로그램을 통해 에이전트의 실행 과정을 추적(Trajectory)하고 나중에 분석해야 한다면 `runHeadless`를 사용하세요.
- 단순한 챗봇이나 특정 도구 실행 후 결과를 바로 보여줘야 하는 CLI라면 `runAgentLoop`가 적합합니다.

## `CheckpointHistory` vs Preset Factories

메시지 히스토리와 컴팩션(Compaction)을 관리하는 방식입니다.

- **`CheckpointHistory` 직접 사용:** 컴팩션 정책(`keepRecentTokens`, `thresholdRatio` 등)을 세밀하게 조정해야 하거나, 커스텀 `SessionStore`를 연결할 때 사용합니다.
- **`createMemoryAgent` / `createSessionAgent`:** 대부분의 경우 이 팩토리 함수를 권장합니다. 기본 컴팩션 설정이 포함되어 있으며, `RunnableAgent`와 `history` 인스턴스를 한 번에 생성해 줍니다.

## Tool Source: MCP vs Custom Bridge

에이전트에게 도구를 제공하는 방식입니다.

- **Config-based MCP (`loadMCPConfig`):** 표준 MCP 서버를 실행하고 도구를 불러올 때 가장 빠릅니다. `.mcp.json` 파일만 있으면 코드 수정 없이 도구를 추가할 수 있습니다.
- **Custom `ToolSource`:** 기존에 이미 작성된 `ToolSet`이 있거나, 런타임에 도구 목록이 동적으로 변해야 하는 경우, 혹은 MCP 규격을 따르지 않는 내부 API를 도구로 노출할 때 사용합니다.

## Archetype 별 패키지 추천

구현하려는 에이전트의 형태에 따라 필요한 패키지 조합입니다.

| Archetype | 추천 패키지 | 비고 |
| :--- | :--- | :--- |
| **CLI / TUI** | `@ai-sdk-tool/harness` + `@ai-sdk-tool/cea` | CEA의 TUI 렌더러와 인터랙션 로직 활용 |
| **Bot / Webhook** | `@ai-sdk-tool/harness` | Stateless한 요청 처리에 최적화 |
| **Server / Worker** | `@ai-sdk-tool/headless` | 장기 실행 세션, 관측성(Observability) 중요 |
