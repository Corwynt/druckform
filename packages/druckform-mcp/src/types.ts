export type JobStatus =
  | "pending"     // created, upload URL issued, not yet uploaded
  | "uploaded"    // bundle received, waiting for finalize_job
  | "rendering"   // druck render subprocess running
  | "done"        // PDF ready
  | "error";      // render failed

export interface Job {
  id: string;
  status: JobStatus;
  template: string;
  style: string;             // path within the bundle
  dir: string;               // /work/jobs/<id>/
  uploadToken: string;
  downloadToken: string;
  uploadUsed: boolean;
  downloadUsed: boolean;
  expiresAt: number;         // ms epoch
  createdAt: number;         // ms epoch
  errorSummary?: string;
  errorFindings?: unknown[];
}

export interface ManifestSpec {
  document: string;
  assets: string;
  maxBytes: number;
}
