import { useState } from 'react';
import { Card, Checkbox, Button, Tag, Empty, Space, Typography, List, message } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  SwapOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { RunRecord } from '../types';
import { exportResultsToExcel } from '../utils/exportExcel';

const { Text } = Typography;

interface Props {
  records: RunRecord[];
  onDelete: (id: string) => void;
  onSelectForCompare: (ids: string[]) => void;
}

export default function RecordPanel({ records, onDelete, onSelectForCompare }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleCompare = () => {
    if (selectedIds.size >= 2) {
      onSelectForCompare(Array.from(selectedIds));
    }
  };

  const handleExport = async (record: RunRecord) => {
    setExportingId(record.id);
    try {
      const savedPath = await exportResultsToExcel(record.results, record.name);
      if (savedPath) {
        messageApi.success('历史记录已导出到本地');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      messageApi.error(`导出失败：${errorMessage}`);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <>
      {contextHolder}
      <Card
      size="small"
      title={
        <Space>
          <HistoryOutlined />
          <span>历史记录</span>
        </Space>
      }
      extra={
        selectedIds.size >= 2 ? (
          <Button
            type="primary"
            size="small"
            icon={<SwapOutlined />}
            onClick={handleCompare}
          >
            对比选中 ({selectedIds.size})
          </Button>
        ) : null
      }
    >
      {records.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无历史记录"
        />
      ) : (
        <List
          size="small"
          dataSource={records}
          renderItem={(record) => (
            <List.Item
              style={{ padding: '8px 0' }}
              actions={[
                <Button
                  key="export"
                  size="small"
                  type="text"
                  icon={<DownloadOutlined />}
                  loading={exportingId === record.id}
                  title="导出该记录的全部结果"
                  onClick={() => handleExport(record)}
                >
                  导出
                </Button>,
                <Button
                  key="delete"
                  size="small"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => onDelete(record.id)}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Checkbox
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)}
                    />
                    <Text strong style={{ fontSize: 13 }}>{record.name}</Text>
                  </Space>
                }
                description={
                  <div style={{ paddingLeft: 22 }}>
                    <Space size={8}>
                      <Tag color="blue">{record.questions.length} 个问题</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined /> {new Date(record.createdAt).toLocaleString()}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      {record.questions.map((q, i) => (
                        <Tag key={i} style={{ marginBottom: 2, fontSize: 11 }}>
                          #{i + 1} {q.length > 20 ? q.substring(0, 20) + '...' : q}
                        </Tag>
                      ))}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
      </Card>
    </>
  );
}
