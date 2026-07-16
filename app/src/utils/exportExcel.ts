import { invoke, isTauri } from '@tauri-apps/api/core';
import type { QuestionResult } from '../types';

function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return sanitized || 'LLM导出结果';
}

function createTimestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

export async function exportResultsToExcel(
  results: QuestionResult[],
  name = 'LLM全部结果',
): Promise<string | null> {
  if (results.length === 0) {
    throw new Error('没有可导出的结果');
  }

  const XLSX = await import('xlsx');
  const rows = results.map((result, index) => ({
    序号: index + 1,
    问题: result.question,
    回答: result.full_response,
    状态: result.success ? '成功' : '失败',
    错误信息: result.error || '',
    时间: result.timestamp,
    来源文档: result.source_documents?.length
      ? JSON.stringify(result.source_documents, null, 2)
      : '',
    工具调用: result.used_tools?.length
      ? JSON.stringify(result.used_tools, null, 2)
      : '',
    元数据: result.metadata ? JSON.stringify(result.metadata, null, 2) : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  if (worksheet['!ref']) {
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
  }
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 40 },
    { wch: 100 },
    { wch: 10 },
    { wch: 30 },
    { wch: 22 },
    { wch: 60 },
    { wch: 60 },
    { wch: 40 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '全部结果');

  const fileName = `${sanitizeFileName(name)}_${createTimestamp()}.xlsx`;
  if (!isTauri()) {
    XLSX.writeFile(workbook, fileName, { compression: true });
    return fileName;
  }

  const workbookData = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });
  const bytes = new Uint8Array(workbookData);
  return invoke<string | null>('save_excel_file', {
    fileName,
    data: Array.from(bytes),
  });
}
