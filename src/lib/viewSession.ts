import { v4 as uuidv4 } from "uuid";

const SESSION_KEY = "__view_session_id";

export function getViewSessionId(): string {
  if (typeof window === "undefined") return uuidv4();
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
