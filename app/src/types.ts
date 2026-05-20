export interface ApiConfig {
  url: string;
  chatId: string;
  streaming: boolean;
  headers: Record<string, string>;
}

export interface StreamChunk {
  question_index: number;
  question: string;
  chunk: string;
  done: boolean;
}

export interface SourceDocumentMetadata {
  id?: string;
  score?: number;
  file_id?: string;
  doc_id?: string;
  kb_dir_id?: string;
  chunk_index?: number;
  is_enabled?: boolean;
  _index?: string;
  source?: string;
  fileName?: string;
  [key: string]: unknown;
}

export interface SourceDocument {
  pageContent: string;
  metadata: SourceDocumentMetadata;
}

export interface UsedTool {
  tool: string;
  toolInput: string;
  toolOutput: string;
}

export interface FlowiseMetadata {
  chatId?: string;
  chatMessageId?: string;
  question?: string;
  sessionId?: string;
  memoryType?: string;
}

export interface QuestionResult {
  question_index: number;
  question: string;
  full_response: string;
  timestamp: string;
  success: boolean;
  error: string | null;
  source_documents?: SourceDocument[];
  used_tools?: UsedTool[];
  metadata?: FlowiseMetadata;
}

export interface RunRecord {
  id: string;
  name: string;
  apiConfig: ApiConfig;
  questions: string[];
  results: QuestionResult[];
  createdAt: string;
}
