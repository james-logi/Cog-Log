// 스펙 6.1 계정 규칙: "로그인 ID는 정규화 후 중복을 허용하지 않는다."
export function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}
