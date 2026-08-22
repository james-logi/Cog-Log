// TXT/XLSX export queue contracts (spec section 6.6).
// Concrete file writers, retry scheduling, and midnight rollover are left
// for the "파일 Export" step (spec 18장 5단계).

export type FileFormat = "TXT" | "XLSX";
export type SaveStatus = "DISABLED" | "PENDING" | "WRITING" | "SAVED" | "FAILED";

export interface ExportJob {
  logRecordId: string;
  format: FileFormat;
}

export interface ExportWriter {
  write(job: ExportJob): Promise<{ status: SaveStatus; targetPath?: string; error?: string }>;
}
