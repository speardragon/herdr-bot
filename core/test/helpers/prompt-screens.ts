// Verbatim `herdr agent read --source detection` dumps of Claude Code 2.1.274 blocked forms, captured
// against a real pane (2026-09-17) and trimmed to the tail herdr's own detection rules look at.
// Shared by the parser test and the mirror/dispatcher tests that script a blocked fake agent.

const RULE = "─".repeat(120);

export const BASH_PERMISSION_SCREEN = `
❯ Run this exact shell command and nothing else, do not explain: mkdir -p /tmp/hb-probe && rm -rf /tmp/hb-probe

⏺ Bash(mkdir -p /tmp/hb-probe && rm -rf /tmp/hb-probe)

${RULE}
 Bash command

   mkdir -p /tmp/hb-probe && rm -rf /tmp/hb-probe
   Create and remove a probe directory in /tmp

 Ask rule Bash(rm *) overrides auto mode for this command.
 /permissions to let auto mode decide

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don’t ask again for: mkdir -p /tmp/hb-probe
   3. No

 Esc to cancel · Tab to amend
`;

export const ASK_SINGLE_SCREEN = `
❯ Use the AskUserQuestion tool right now to ask me one question: 'Which color do you prefer?' with exactly three
  options: Red (warm), Green (natural), Blue (calm). Do nothing else.
${RULE}
 ☐ Color

Which color do you prefer?

❯ 1. Red
     warm
  2. Green
     natural
  3. Blue
     calm
  4. Type something.
${RULE}
  5. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
`;

export const ASK_MULTI_QUESTION_SCREEN = `
${RULE}
←  ☐ Size  ☐ Toppings  ✔ Submit  →

Which size?

❯ 1. Small
     Small size
  2. Large
     Large size
  3. Type something.
${RULE}
  4. Chat about this

Enter to select · Tab/Arrow keys to navigate · Esc to cancel
`;

export const ASK_MULTI_SELECT_SCREEN = `
${RULE}
←  ☒ Size  ☐ Toppings  ✔ Submit  →

Which toppings?

❯ 1. [✔] Cheese
  Add cheese
  2. [ ] Olives
  Add olives
  3. [✔] Onion
  Add onion
  4. [ ] Type something
     Submit
${RULE}
  5. Chat about this

Enter to select · Tab/Arrow keys to navigate · Esc to cancel
`;

export const ASK_REVIEW_SCREEN = `
${RULE}
←  ☒ Size  ☒ Toppings  ✔ Submit  →

Review your answers

 ● Which size?
   → Large
 ● Which toppings?
   → Onion

Ready to submit your answers?

❯ 1. Submit answers
  2. Cancel
`;

export const IDLE_SCREEN = `
⏺ Replied with today's date (2026-09-11) in the DM.

✻ Crunched for 5s · done Friday 8:37 AM
${RULE}
❯
${RULE}
  [Sonnet 5] │ goorm │ ⏱️  137h 44m
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
`;

export const UNKNOWN_FORM_SCREEN = `
${RULE}
 Do you trust the files in this folder?

 /Users/goorm/Desktop/repo

 Enter to confirm · Esc to cancel
`;

/** The onboarding question: a long question line gets a leading "│" bar, and the tool caps options at 4
 * (a 5th option was rejected with "Invalid input" -- see the tail above the rule in the raw capture). */
export const ASK_ONBOARDING_SCREEN = `
⏺ The tool caps options at 4, so I'll retry with the first four and let the built-in "Other" cover the undecided case.
${RULE}
 ☐ 용도

│ 저를 주로 어디에 쓰고 싶으세요? 가까운 것부터 골라 주시면, 그에 맞춰 바로 맞춰 볼게요.

❯ 1. 코드·PR·리뷰
     리뷰, 리팩터링, 버그 수정
  2. MongoDB·데이터
     쿼리, 집계, 데이터 정리
  3. 장애·APM·운영
     모니터링, 장애 대응
  4. 일정·리마인더·잡무
     알림, 반복 작업
  5. Type something.
${RULE}
  6. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
`;

/** A question long enough to wrap keeps the bar on every continuation line (synthetic, from the same layout). */
export const ASK_WRAPPED_QUESTION_SCREEN = `
${RULE}
 ☐ Scope

│ Which of these areas should I focus on first when I start going through the repository this week? Pick the closest
│ one and I will tailor my first pass to it.

❯ 1. Tests
  2. Docs
  3. Type something.
${RULE}
  4. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
`;
