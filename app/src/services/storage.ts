import type { RunRecord } from '../types';

const STORAGE_KEY = 'llm_compare_records';
const MAX_RECORDS = 10;

export function loadRecords(): RunRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load records:', e);
  }
  return [];
}

export function saveRecords(records: RunRecord[]): void {
  try {
    // Only keep the most recent MAX_RECORDS
    const trimmed = records.slice(0, MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save records:', e);
  }
}

export function addRecord(record: RunRecord): RunRecord[] {
  const records = loadRecords();
  records.unshift(record);
  // Trim to MAX_RECORDS
  const trimmed = records.slice(0, MAX_RECORDS);
  saveRecords(trimmed);
  return trimmed;
}

export function deleteRecord(id: string): RunRecord[] {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
  return records;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
