import { useState } from 'react';
import { Input, Button, Space, Badge, Card, Select, Tooltip, message } from 'antd';
import { PlayCircleOutlined, StopOutlined, EditOutlined, ImportOutlined } from '@ant-design/icons';
import type { RunRecord } from '../types';

interface Props {
  onSubmit: (questions: string[]) => void;
  disabled: boolean;
  records: RunRecord[];
}

export default function QuestionInput({ onSubmit, disabled, records }: Props) {
  const [text, setText] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const questions = text
    .split('\n')
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  const handleImportFromRecord = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || record.questions.length === 0) return;
    setText(record.questions.join('\n'));
    messageApi.success(`已导入 ${record.questions.length} 个问题`);
  };

  const handleSubmit = () => {
    if (questions.length === 0) return;
    onSubmit(questions);
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <EditOutlined />
          <span>批量问题输入</span>
          <Badge
            count={questions.length}
            showZero
            style={{ backgroundColor: '#1677ff' }}
          />
        </Space>
      }
    >
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"每行输入一个问题，例如：\n你好吗？\n什么是人工智能？\n请介绍一下React"}
        rows={6}
        disabled={disabled}
        style={{ marginBottom: 8 }}
      />
      {records.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Select
            style={{ width: '100%' }}
            placeholder="从历史记录导入问题..."
            value={undefined}
            onChange={handleImportFromRecord}
            allowClear
            onClear={() => {}}
            suffixIcon={<ImportOutlined />}
            options={records.map((r) => ({
              value: r.id,
              label: (
                <Tooltip title={r.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}>
                  <span>
                    {r.name}（{r.questions.length} 题）
                  </span>
                </Tooltip>
              ),
            }))}
          />
        </div>
      )}
      <Space>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleSubmit}
          disabled={disabled || questions.length === 0}
          loading={disabled}
        >
          {disabled ? '执行中...' : '开始批量请求'}
        </Button>
        {disabled && (
          <Button danger icon={<StopOutlined />}>
            停止
          </Button>
        )}
      </Space>
      {contextHolder}
    </Card>
  );
}
