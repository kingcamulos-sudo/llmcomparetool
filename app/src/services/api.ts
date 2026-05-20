import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { StreamChunk, QuestionResult, ApiConfig } from '../types';

export interface FlowiseExtraEvent {
  question_index: number;
  event_type: string; // "sourceDocuments" | "usedTools" | "metadata"
  data: unknown;
}

export async function sendQuestion(
  apiUrl: string,
  question: string,
  chatId: string,
  streaming: boolean,
  questionIndex: number,
  headers?: Record<string, string>
): Promise<QuestionResult> {
  return invoke<QuestionResult>('send_question', {
    apiUrl,
    question,
    chatId,
    streaming,
    questionIndex,
    headers: headers || {},
  });
}

export async function sendQuestionsBatch(
  apiUrl: string,
  questions: string[],
  chatId: string,
  streaming: boolean,
  headers?: Record<string, string>
): Promise<QuestionResult[]> {
  return invoke<QuestionResult[]>('send_questions_batch', {
    apiUrl,
    questions,
    chatId,
    streaming,
    headers: headers || {},
  });
}

export async function stopBatch(): Promise<void> {
  return invoke('stop_batch');
}

export function listenStreamChunk(
  callback: (event: StreamChunk) => void
): Promise<UnlistenFn> {
  return listen<StreamChunk>('stream-chunk', (e) => callback(e.payload));
}

export function listenFlowiseExtra(
  callback: (event: FlowiseExtraEvent) => void
): Promise<UnlistenFn> {
  return listen<FlowiseExtraEvent>('flowise-extra', (e) => callback(e.payload));
}

export function listenQuestionComplete(
  callback: (result: QuestionResult) => void
): Promise<UnlistenFn> {
  return listen<QuestionResult>('question-complete', (e) =>
    callback(e.payload)
  );
}

export function listenBatchComplete(
  callback: (results: QuestionResult[]) => void
): Promise<UnlistenFn> {
  return listen<QuestionResult[]>('batch-complete', (e) =>
    callback(e.payload)
  );
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  url: 'http://10.203.16.23:18086/api/v1/prediction/62103456-3199-415e-87fd-ba657c63674f',
  chatId: '',
  streaming: true,
  headers: {},
};
