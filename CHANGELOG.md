# Changelog

## 1.0.1 (2026-10-05)

- Remove `@microsoft/agent-framework` peer dependency from `package.json`. Microsoft Agent Framework is not currently published to npm under that name/version, so declaring it as a peer caused `npm install @aiyoplane/microsoft-agent-framework` to fail at install time even though the adapter itself has zero runtime dependency on the framework. The adapter is a shape-match library — it defines classes and functions compatible with Microsoft Agent Framework's middleware interface; users wire it up with whatever framework they're using. No behavior change.

## 1.0.0 (2026-10-05) — install blocked

- Initial release.
- AEAP Composition Boundary Adapter for the Microsoft Agent Framework (Node).
- Two integration surfaces: `AiyoAgentMiddleware` for the middleware chain and `wrapAction` for workflow nodes / direct function invocations.
- Fail-closed defaults per AEAP §2.2 invariant 5.
- Apache 2.0.
