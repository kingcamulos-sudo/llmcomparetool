import React, { useState, useMemo } from 'react';
import { Table, Select, Button, Space, Card, Typography, Alert, Tag, Tooltip } from 'antd';
import { PrinterOutlined, CloseOutlined, SwapOutlined, DiffOutlined } from '@ant-design/icons';
import * as Diff from 'diff';
import type { RunRecord } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

/** Compute similarity between two texts using word-level Jaccard index */
function computeSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().split(/[\s,，。.!！?？;；:：、\n]+/).filter(w => w.length > 0));
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  let intersection = 0;
  setA.forEach(w => { if (setB.has(w)) intersection++; });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Render a diff view between two texts using the diff library */
function DiffView({ textA, textB, labelA, labelB }: { textA: string; textB: string; labelA: string; labelB: string }) {
  const changes = Diff.diffLines(textA || '', textB || '');

  return (
    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11, color: '#666' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#ffecec', border: '1px solid #ffc0c0', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />仅 {labelA}</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#e6ffec', border: '1px solid #abf2bc', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />仅 {labelB}</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#f0f0f0', border: '1px solid #d9d9d9', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />相同</span>
      </div>

      {changes.map((part, i) => {
        const lines = part.value.split('\n');
        const isLast = i === changes.length - 1;
        // Remove trailing empty line from split
        const displayLines = isLast && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;

        if (part.added) {
          return displayLines.map((line, j) => (
            <div key={`add-${i}-${j}`} style={{ background: '#e6ffec', borderLeft: '3px solid #52c41a', padding: '0 8px', color: '#1a4d1a' }}>
              <span style={{ color: '#52c41a', marginRight: 6, fontWeight: 600 }}>+</span>{line || '\u00A0'}
            </div>
          ));
        } else if (part.removed) {
          return displayLines.map((line, j) => (
            <div key={`rem-${i}-${j}`} style={{ background: '#ffecec', borderLeft: '3px solid #ff4d4f', padding: '0 8px', color: '#6b1a1a', textDecoration: 'line-through', textDecorationColor: '#ff9999' }}>
              <span style={{ color: '#ff4d4f', marginRight: 6, fontWeight: 600 }}>-</span>{line || '\u00A0'}
            </div>
          ));
        } else {
          return displayLines.map((line, j) => (
            <div key={`eq-${i}-${j}`} style={{ background: '#fafafa', padding: '0 8px', color: '#555' }}>
              <span style={{ color: '#bbb', marginRight: 6 }}> </span>{line || '\u00A0'}
            </div>
          ));
        }
      })}
    </div>
  );
}

/** Side-by-side diff view for two responses */
function SideBySideDiff({ textA, textB, labelA, labelB }: { textA: string; textB: string; labelA: string; labelB: string }) {
  const changes = Diff.diffLines(textA || '', textB || '');
  let lineA = 0, lineB = 0;
  const rows: { left: string | null; right: string | null; type: 'equal' | 'left-only' | 'right-only' }[] = [];

  for (const part of changes) {
    const partLines = part.value.replace(/\n$/, '').split('\n');
    if (part.added) {
      for (const l of partLines) {
        rows.push({ left: null, right: l, type: 'right-only' });
        lineB++;
      }
    } else if (part.removed) {
      for (const l of partLines) {
        rows.push({ left: l, right: null, type: 'left-only' });
        lineA++;
      }
    } else {
      for (const l of partLines) {
        rows.push({ left: l, right: l, type: 'equal' });
        lineA++;
        lineB++;
      }
    }
  }

  return (
    <div style={{ display: 'flex', gap: 0, fontSize: 13, lineHeight: 1.7 }}>
      {/* Left column */}
      <div style={{ flex: 1, overflow: 'auto', borderRight: '2px solid #e8e8e8' }}>
        <div style={{ background: '#fafafa', padding: '4px 8px', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #e8e8e8', color: '#666' }}>{labelA}</div>
        {rows.map((row, i) => {
          if (row.type === 'right-only') {
            return <div key={i} style={{ background: '#f6fff9', padding: '0 8px', minHeight: 22, color: '#ccc' }}>{'\u00A0'}</div>;
          }
          const isRemoved = row.type === 'left-only';
          return (
            <div key={i} style={{
              background: isRemoved ? '#ffecec' : '#fff',
              borderLeft: isRemoved ? '3px solid #ff4d4f' : '3px solid transparent',
              padding: '0 8px',
              color: isRemoved ? '#6b1a1a' : '#333',
              textDecoration: isRemoved ? 'line-through' : 'none',
              textDecorationColor: '#ff9999',
              minHeight: 22,
            }}>
              {row.left || '\u00A0'}
            </div>
          );
        })}
      </div>
      {/* Right column */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ background: '#fafafa', padding: '4px 8px', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #e8e8e8', color: '#666' }}>{labelB}</div>
        {rows.map((row, i) => {
          if (row.type === 'left-only') {
            return <div key={i} style={{ background: '#fff8f8', padding: '0 8px', minHeight: 22, color: '#ccc' }}>{'\u00A0'}</div>;
          }
          const isAdded = row.type === 'right-only';
          return (
            <div key={i} style={{
              background: isAdded ? '#e6ffec' : '#fff',
              borderLeft: isAdded ? '3px solid #52c41a' : '3px solid transparent',
              padding: '0 8px',
              color: isAdded ? '#1a4d1a' : '#333',
              minHeight: 22,
            }}>
              {row.right || '\u00A0'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Similarity badge component */
function SimilarityBadge({ score }: { score: number }) {
  const percent = Math.round(score * 100);
  return (
    <Tooltip title={`文本相似度: ${percent}%`}>
      <Tag
        icon={<DiffOutlined />}
        color={percent >= 80 ? 'green' : percent >= 50 ? 'orange' : 'red'}
        style={{ fontSize: 12, marginTop: 4 }}
      >
        {percent}%
      </Tag>
    </Tooltip>
  );
}

const { Text } = Typography;

interface Props {
  records: RunRecord[];
  selectedIds: string[];
  onClose: () => void;
}

export default function ComparePanel({ records, selectedIds, onClose }: Props) {
  const [questionFilter, setQuestionFilter] = useState<number | null>(null);

  const selectedRecords = records.filter((r) => selectedIds.includes(r.id));

  const allQuestions = new Map<string, { question: string; indices: Map<string, number> }>();
  selectedRecords.forEach((record) => {
    record.questions.forEach((q, idx) => {
      const key = q;
      if (!allQuestions.has(key)) {
        allQuestions.set(key, { question: q, indices: new Map() });
      }
      allQuestions.get(key)!.indices.set(record.id, idx);
    });
  });

  const questionList = Array.from(allQuestions.entries());
  const filteredQuestions = questionFilter !== null
    ? questionList.filter((_, i) => i === questionFilter)
    : questionList;

  const handlePrintCompare = () => {
    const content = filteredQuestions.map(([_, info]) => {
      const parts = [`【问题】${info.question}`];
      selectedRecords.forEach((record) => {
        const qIdx = info.indices.get(record.id);
        if (qIdx !== undefined && record.results[qIdx]) {
          parts.push(`\n【${record.name}】\n${record.results[qIdx].full_response}`);
        }
      });
      return parts.join('\n');
    }).join('\n\n' + '═'.repeat(50) + '\n\n');

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>对比结果</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; padding: 24px; max-width: 1200px; margin: 0 auto; }
          h2 { color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 8px; }
          pre { white-space: pre-wrap; word-wrap: break-word; background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 8px 0; line-height: 1.8; }
        </style>
        </head><body>
        <h2>对比结果 - ${selectedRecords.map(r => r.name).join(' vs ')}</h2>
        <pre>${content}</pre>
        </body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Precompute similarity scores for each question across records
  const similarityScores = useMemo(() => {
    const data = new Map<string, number[][]>();
    for (const [key, info] of questionList) {
      const responses: string[] = [];
      selectedRecords.forEach((record) => {
        const qIdx = info.indices.get(record.id);
        if (qIdx !== undefined && record.results[qIdx]) {
          responses.push(record.results[qIdx].full_response);
        }
      });
      const scores: number[][] = [];
      if (responses.length >= 2) {
        for (let i = 0; i < responses.length; i++) {
          scores[i] = scores[i] || [];
          for (let j = 0; j < responses.length; j++) {
            if (i === j) { scores[i][j] = 1; continue; }
            if (scores[i]?.[j] !== undefined) continue;
            const sim = computeSimilarity(responses[i], responses[j]);
            scores[i] = scores[i] || [];
            scores[j] = scores[j] || [];
            scores[i][j] = sim;
            scores[j][i] = sim;
          }
        }
      }
      data.set(key, scores);
    }
    return data;
  }, [questionList, selectedRecords]);

  const [compareMode, setCompareMode] = useState<'normal' | 'inline-diff' | 'side-by-side'>('normal');

  const COLUMN_WIDTH = compareMode === 'side-by-side' ? 960 : 480; // 并排对比需要更宽

  const columns = [
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      width: 200,
      fixed: 'left' as const,
      render: (text: string, row: { key: string }) => {
        const scores = similarityScores.get(row.key);
        let avgSim: number | null = null;
        if (scores && scores.length >= 2) {
          let total = 0, count = 0;
          for (let i = 0; i < scores.length; i++) {
            for (let j = i + 1; j < scores.length; j++) {
              if (scores[i]?.[j] !== undefined) { total += scores[i][j]; count++; }
            }
          }
          if (count > 0) avgSim = total / count;
        }
        return (
          <div>
            <Text strong>{text}</Text>
            {avgSim !== null && <SimilarityBadge score={avgSim} />}
          </div>
        );
      },
    },
    ...selectedRecords.map((record, recordIdx) => ({
      title: (
        <Space>
          <SwapOutlined />
          {record.name}
        </Space>
      ),
      dataIndex: record.id,
      key: record.id,
      width: COLUMN_WIDTH,
      render: (_: unknown, row: { key: string; question: string; responses: Map<string, { full_response: string; success: boolean; error: string | null }> }) => {
        const result = row.responses.get(record.id);
        if (!result) {
          return <Alert type="warning" message="此记录无此问题" showIcon />;
        }

        // Pairwise similarity tags
        const scores = similarityScores.get(row.key);
        const pairwiseTags: { name: string; score: number }[] = [];
        if (scores && scores.length >= 2) {
          selectedRecords.forEach((otherRecord, otherIdx) => {
            if (otherRecord.id !== record.id && scores[recordIdx]?.[otherIdx] !== undefined) {
              pairwiseTags.push({
                name: otherRecord.name.length > 10 ? otherRecord.name.substring(0, 10) + '...' : otherRecord.name,
                score: scores[recordIdx][otherIdx],
              });
            }
          });
        }

        // Diff mode: get the first OTHER record's response for comparison
        let diffContent: React.ReactNode | null = null;
        if (compareMode !== 'normal' && selectedRecords.length >= 2) {
          const otherIdx = recordIdx === 0 ? 1 : 0;
          const otherRecord = selectedRecords[otherIdx];
          const otherQIdx = row.responses.get(otherRecord.id);
          if (otherQIdx) {
            const labelA = record.name.length > 12 ? record.name.substring(0, 12) + '...' : record.name;
            const labelB = otherRecord.name.length > 12 ? otherRecord.name.substring(0, 12) + '...' : otherRecord.name;
            if (compareMode === 'side-by-side') {
              diffContent = (
                <SideBySideDiff
                  textA={result.full_response}
                  textB={otherQIdx.full_response}
                  labelA={labelA}
                  labelB={labelB}
                />
              );
            } else {
              diffContent = (
                <DiffView
                  textA={result.full_response}
                  textB={otherQIdx.full_response}
                  labelA={labelA}
                  labelB={labelB}
                />
              );
            }
          }
        }

        return (
          <div style={{
            width: COLUMN_WIDTH - 24,
            maxHeight: compareMode === 'normal' ? 400 : 600,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px 12px',
            background: result.success ? '#fff' : '#fff2f0',
            borderRadius: 8,
            border: result.success ? '1px solid #f0f0f0' : '1px solid #ffa39e',
            wordBreak: 'break-word' as const,
          }}>
            {pairwiseTags.length > 0 && (
              <div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {pairwiseTags.map((ps, i) => (
                  <Tag key={i} style={{ fontSize: 10, margin: 0 }}
                    color={ps.score >= 0.8 ? 'green' : ps.score >= 0.5 ? 'orange' : 'red'}
                  >
                    vs {ps.name}: {Math.round(ps.score * 100)}%
                  </Tag>
                ))}
              </div>
            )}
            {compareMode !== 'normal' && diffContent ? diffContent : (
              <MarkdownRenderer content={result.full_response} />
            )}
            {result.error && (
              <Alert type="error" message={result.error} style={{ marginTop: 4 }} showIcon />
            )}
          </div>
        );
      },
    })),
  ];

  const dataSource = filteredQuestions.map(([key, info]) => {
    const responses = new Map<string, { full_response: string; success: boolean; error: string | null }>();
    selectedRecords.forEach((record) => {
      const qIdx = info.indices.get(record.id);
      if (qIdx !== undefined && record.results[qIdx]) {
        responses.set(record.id, record.results[qIdx]);
      }
    });
    return { key, question: info.question, responses };
  });

  return (
    <div>
      <Card
        size="small"
        title={
          <Space>
            <SwapOutlined />
            <span>对比视图</span>
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<DiffOutlined />}
              type={compareMode !== 'normal' ? 'primary' : 'default'}
              onClick={() => {
                const modes: ('normal' | 'inline-diff' | 'side-by-side')[] = ['normal', 'inline-diff', 'side-by-side'];
                const idx = modes.indexOf(compareMode);
                setCompareMode(modes[(idx + 1) % modes.length]);
              }}
            >
              {compareMode === 'normal' ? '原文对比' : compareMode === 'inline-diff' ? '逐行对比' : '并排对比'}
            </Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrintCompare}>
              打印对比
            </Button>
            <Button icon={<CloseOutlined />} onClick={onClose}>
              关闭
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space>
          <Text>筛选问题：</Text>
          <Select
            style={{ width: 300 }}
            value={questionFilter === null ? 'all' : questionFilter}
            onChange={(val) => setQuestionFilter(val === 'all' ? null : Number(val))}
            options={[
              { value: 'all', label: '全部问题' },
              ...questionList.map(([_key, info], i) => ({
                value: i,
                label: info.question.length > 30 ? info.question.substring(0, 30) + '...' : info.question,
              })),
            ]}
          />
        </Space>
      </Card>

      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        bordered
        size="small"
        scroll={{ x: 200 + selectedRecords.length * COLUMN_WIDTH }}
      />
    </div>
  );
}
