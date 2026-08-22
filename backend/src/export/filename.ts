// 스펙 10.3: 파일명은 저장 설정의 filenamePattern에서 YYYY-MM-DD 자리를
// 실제 처리 시점 날짜로 치환한다(기본값 LOG-06: VisionLog_YYYY-MM-DD).
export function buildFilename(pattern: string, dailyDate: string, extension: string): string {
  const base = pattern.includes("YYYY-MM-DD") ? pattern.replace("YYYY-MM-DD", dailyDate) : `${pattern}_${dailyDate}`;
  return `${base}.${extension}`;
}
