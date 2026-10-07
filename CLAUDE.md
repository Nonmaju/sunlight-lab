# sunlight-lab

Browser-only "일조·일조권 사선 검토기": enter a site and a building mass, see shadows by date/time, a winter-solstice sunlight-hours heatmap, and the parts of the mass that violate the Korean north-side daylight setback (정북방향 일조 사선). Portfolio demo; one link, no server.

## Working rules (set by the user)
- Main work runs on **Sonnet 5.5**.
- For judgment calls (architecture choices, legal-rule interpretation, algorithm trade-offs, "is this result trustworthy?"), **consult Opus 5.5**: spawn the Agent tool with `model: "opus"`, give it the full context (it starts cold), and weigh its answer before acting. Routine implementation does not need Opus.
- Use `superpowers:brainstorming` first: ask the user one question at a time, propose 2-3 approaches, get design approval, write a spec in `docs/superpowers/specs/`, then `writing-plans`. Do not write code before the user approves the design.
- Verify before claiming. If something was not actually run, say so plainly.

## Hard constraints
- Cost 0 and no GPU: static site (Vercel / GitHub Pages), everything in the browser. No paid APIs, no server.
- **Deploying or making anything public needs the user's explicit OK first.**
- Legal rules (건축법 시행령 제86조 정북방향 일조 등의 확보를 위한 건축물의 높이 제한, 채광 거리 등): cite the exact article from the primary source (law.go.kr) and verify the current text; never rely on memory. Show a "참고용, 법적 효력 없음" disclaimer in the UI. If a rule's interpretation is uncertain, ask the user or Opus rather than guess.
- Do not integrate external terrain / neighbor-building APIs (V-World etc.) at first: user-entered masses only (API key + CORS issues).
- Include a "use a sample" button so a visitor can try it in 30 seconds.
- Sun position must be checked against known reference values (e.g. NOAA / KASI for Seoul at a fixed date/time), not assumed correct.

## Context
- Origin: GPU-free portfolio brainstorm (item 3 of 8), see sibling `facade-generator` / `phash-lab`. Item 1 (Auto-BIM Lite) was excluded because it overlaps the user's team Auto-BIM repo; do not reuse team repo code. Input is a hand-entered mass, not DXF.
- Rough estimate from the brainstorm (Opus inference, not measured): difficulty 3/5, 3-4 weeks. Tech candidates: SunCalc, Three.js shadow maps, raycast sampling for sunlight hours, rule-based geometric setback test, building-coverage / FAR calculation.

## Repo conventions
- GitHub: `Nonmaju/sunlight-lab` (created private; the user decides when to make it public).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Keep it small: plain HTML/JS modules, `node --test` for logic tests, no framework or build step unless the design needs it. Structure reference: `D:\1. 업무용\facade-generator` (`web/`, `tests/`, spec + plan under `docs/superpowers/`).
- UI text in Korean.
