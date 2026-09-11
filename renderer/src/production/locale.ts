import { useSyncExternalStore } from "react";

export type Locale = "ko" | "en";
const listeners = new Set<() => void>();
let locale: Locale = "ko";
try { if (localStorage.getItem("herdr-bot.locale") === "en") locale = "en"; } catch {}
export function setLocale(next: Locale): void {
  locale = next;
  try { localStorage.setItem("herdr-bot.locale", next); } catch {}
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}
export function useLocale(): Locale {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => locale);
}
export function t(english: string, korean?: string): string {
  return locale === "ko" ? korean ?? translations[english] ?? english : english;
}
export const translations: Record<string, string> = {
  "No saved agents yet.": "아직 만든 봇이 없습니다.", "No chats yet": "봇을 만들고 함께 대화를 시작하세요.",
  "Connecting to your computer…": "herdr에 연결하는 중…", "All bots are hidden": "모든 봇이 숨겨져 있습니다",
  "Show Hidden Bots": "숨긴 봇 보기", "Can’t reach your computer": "herdr에 연결할 수 없습니다",
  "Your agents are safe — they just can’t be loaded right now.": "지금은 봇을 불러올 수 없습니다. 연결을 확인하고 다시 시도해 주세요.",
  "Agent list": "봇과 방 목록", "Prompt": "메시지 입력", "Conversation transcript": "대화 기록",
  "Conversation details": "대화 설정", "Edit agent avatar": "봇 아바타 변경",
  "Hide from sidebar": "사이드바에서 숨기기", "Copy conversation ID": "대화 ID 복사", "Mark as Read": "읽음으로 표시", "Mark as Unread": "안 읽음으로 표시",
  "Profile": "프로필", "Full conversation": "전체 대화", "Move to section": "섹션으로 이동", "New section": "새 섹션",
  "All chats": "모든 대화", "Agents": "봇", "Pinned": "고정됨", "Deleting...": "삭제 중…",
  "This permanently deletes the group and its chat history. The Bots in it are not deleted and remain available individually. This can't be undone.": "방과 대화 기록을 삭제합니다. 참여 봇은 유지됩니다. 삭제는 되돌릴 수 없습니다.",
  "This permanently deletes the agent and its chat history. This can't be undone.": "봇과 대화 기록을 삭제합니다. 삭제는 되돌릴 수 없습니다.",
  "Deleting failed. Check your connection and try again.": "삭제하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
  "New": "새로 만들기", "New chat": "새 대화", "Bot": "봇", "Room": "방", "Name": "이름",
  "What to create": "만들 항목", "Persona (optional)": "페르소나 (선택)", "Code Reviewer": "코드 리뷰어",
  "Reviews diffs for correctness and style.": "코드의 정확성을 검토하고 개선점을 제안합니다.",
  "Source": "시작 방식", "Agent": "에이전트", "Agent kind": "에이전트 종류",
  "Start a new agent in herdr": "herdr에서 새 에이전트 시작", "Working directory": "작업 폴더",
  "Where the agent's shell starts": "에이전트가 작업할 폴더", "No such directory": "폴더를 찾을 수 없습니다",
  "Permissions": "실행 권한", "Ask before edits and commands": "에이전트 기본 승인 정책",
  "Agent-specific automation permissions": "에이전트별 자동 실행 권한",
  "Room name": "방 이름", "Auth refactor": "프로젝트 회의", "Goal (optional)": "대화 목적 (선택)",
  "Ship the login fix with tests and a changelog entry.": "각자의 관점에서 문제를 검토하고 의견을 공유합니다.",
  "Create a bot first.": "먼저 봇을 만들어 주세요.", "Cancel": "취소", "Creating…": "만드는 중…",
  "Start bot": "봇 만들기", "Adopt bot": "기존 봇 연결", "Create room": "방 만들기",
  "Settings": "설정", "Close": "닫기", "Language": "언어", "Appearance": "화면 모드",
  "Light": "라이트", "Dark": "다크", "Members": "멤버", "Add Member": "멤버 초대", "Remove": "제외",
  "Create more Bots to add them here.": "새 봇을 만들면 이 방에 초대할 수 있습니다.",
  "Agent settings": "봇 설정", "Agent name": "봇 이름", "Agent description": "페르소나",
  "Description": "페르소나", "What this agent is for": "봇의 역할과 관점을 입력하세요", "Bob": "봇 이름",
  "Notifications": "알림", "Get notified when this agent finishes or needs input": "작업 완료 또는 입력이 필요할 때 알림",
  "On": "켜짐", "Off": "꺼짐", "Close details": "상세 정보 닫기", "View agent settings": "봇 또는 방 설정",
  "Attach file": "파일 첨부", "Send message": "메시지 보내기", "Mention": "봇 멘션",
  "Nothing to mention yet": "멘션할 봇이 없습니다", "Search": "검색", "Delete": "삭제", "Rename": "이름 변경",
  "Copy ID": "ID 복사", "Hide": "숨기기", "Hidden Bots": "숨긴 봇", "Working": "작업 중",
  "Needs attention": "확인 필요", "Unread activity": "읽지 않은 활동", "now": "방금",
  "Load older messages": "이전 메시지 보기", "Loading…": "불러오는 중…", "Retry": "다시 시도",
  "Copy": "복사", "Reply": "답장", "Copied": "복사됨", "Pin": "고정", "Unpin": "고정 해제",
};
