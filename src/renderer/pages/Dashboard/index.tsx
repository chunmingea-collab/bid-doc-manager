import { useCallback, useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Alert, Space, Table, Tag, Typography, Spin, Button } from 'antd';
import {
  FileTextOutlined,
  WarningOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats } from '../../types/electron';

interface ExpiringDoc {
  id: string;
  fileName: string;
  expireDate: string;
  companyName: string;
  certificateNumber: string;
  daysLeft: number;
  bucket: 'overdue' | '30days' | '60days' | '90days';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalCount: 0, thisMonthCount: 0, errorCount: 0, expiringCount: 0 });
  const [reminders, setReminders] = useState<{
    overdue: ExpiringDoc[];
    within30Days: ExpiringDoc[];
    within60Days: ExpiringDoc[];
    within90Days: ExpiringDoc[];
  } | null>(null);

  // Derived: flat list sorted by daysLeft
  const expiringDocs = reminders
    ? [...reminders.overdue, ...reminders.within30Days, ...reminders.within60Days, ...reminders.within90Days]
      .sort((a, b) => a.daysLeft - b.daysLeft)
    : [];

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [s, reminderResult] = await Promise.all([
        window.electronAPI.getDashboardStats(),
        window.electronAPI.checkReminders(),
      ]);
      setStats(s);
      setReminders(reminderResult);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const expiringColumns = [
    {
      title: '文件名称',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (name: string) => (
        <span style={{ cursor: 'pointer', color: '#1677ff' }}>{name}</span>
      ),
    },
    {
      title: '企业名称',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 150,
      render: (name: string) => name || '--',
    },
    {
      title: '剩余天数',
      dataIndex: 'daysLeft',
      key: 'daysLeft',
      width: 100,
      render: (days: number) => {
        if (days < 0) return <Tag color="error">已过期 {Math.abs(days)} 天</Tag>;
        if (days <= 30) return <Tag color="warning">{days} 天</Tag>;
        return <Tag color="blue">{days} 天</Tag>;
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>资料总览</h2>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="资料总数"
              value={stats.totalCount}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增"
              value={stats.thisMonthCount}
              prefix={<PlusOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="即将过期"
              value={stats.expiringCount}
              prefix={<WarningOutlined />}
              valueStyle={{ color: stats.expiringCount > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="处理异常"
              value={stats.errorCount}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: stats.errorCount > 0 ? '#faad14' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Space direction="vertical" style={{ marginTop: 24 }} size="large">
        <Card
          title="即将过期的资料"
          extra={
            <Button size="small" onClick={() => navigate('/documents')}>
              查看全部
            </Button>
          }
        >
          {expiringDocs.length > 0 ? (
            <Table
              rowKey="id"
              columns={expiringColumns}
              dataSource={expiringDocs.slice(0, 10)}
              pagination={false}
              size="small"
            />
          ) : (
            <Alert
              message="暂无即将过期的资料"
              description="系统会自动检测资料有效期，并在到期前30/60/90天提醒您"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          )}
        </Card>

        {reminders && (
          <Card title="过期统计">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="已过期"
                  value={reminders.overdue.length}
                  valueStyle={{ color: '#f5222d' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="30天内"
                  value={reminders.within30Days.length}
                  valueStyle={{ color: '#faad14' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="60天内"
                  value={reminders.within60Days.length}
                  valueStyle={{ color: '#1890ff' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="90天内"
                  value={reminders.within90Days.length}
                  valueStyle={{ color: '#52c41a' }}
                  suffix="份"
                />
              </Col>
            </Row>
          </Card>
        )}
      </Space>
    </div>
  );
}