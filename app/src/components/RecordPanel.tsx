import { useState } from 'react';
import { Card, Checkbox, Button, Tag, Empty, Space, Typography, List } from 'antd';
import {
  DeleteOutlined,
  SwapOutlined,
  HistoryOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { RunRecord } from '../types';

const { Text } = Typography;

interface Props {
  records: RunRecord[];
  onDelete: (id: string) => void;
  onSelectForCompare: (ids: string[]) => void;
}

export default function RecordPanel({ records, onDelete, onSelectForCompare }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  return (
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
  );
}
