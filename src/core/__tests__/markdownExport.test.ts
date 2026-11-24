import { describe, expect, it } from 'vitest';
import { generateWeekMarkdown } from '@/core/markdownExport';
import type { WeekBundle } from '@/types/schedule';

describe('generateWeekMarkdown', () => {
  it('renders weekly focus and all 7 days including Saturday and Sunday', () => {
    const bundle: WeekBundle = {
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
      focuses: [
        {
          id: 'f1',
          weekStart: '2026-11-23',
          title: '产品方案评审报告',
          targetText: '本周五',
          statusNote: null,
          isDone: false,
          sortOrder: 0,
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
        },
        {
          id: 'f2',
          weekStart: '2026-11-23',
          title: '季度规划同步会',
          targetText: '下周初',
          statusNote: '待排期',
          isDone: true,
          sortOrder: 1,
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          taskDate: '2026-11-23',
          startTime: '09:00',
          endTime: '10:00',
          title: '周会',
          isDone: true,
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
        },
        {
          id: 't2',
          taskDate: '2026-11-28',
          startTime: '10:00',
          endTime: '11:30',
          title: '周末阅读',
          isDone: false,
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
        },
      ],
      memos: [
        {
          id: 'm1',
          memoDate: '2026-11-23',
          content: '记录备忘信息',
          sortOrder: 0,
          createdAt: '2026-11-23T00:00:00Z',
          updatedAt: '2026-11-23T00:00:00Z',
        },
      ],
    };

    const md = generateWeekMarkdown(bundle);
    expect(md).toContain('# 2026-11-23 所在周');
    expect(md).toContain('- [ ] 产品方案评审报告（本周五）');
    expect(md).toContain('- [x] 季度规划同步会（下周初）  待排期');
    expect(md).toContain('## 11-23 周一');
    expect(md).toContain('- [x] 09:00-10:00 周会');
    expect(md).toContain('  - 记录备忘信息');
    expect(md).toContain('## 11-28 周六');
    expect(md).toContain('- [ ] 10:00-11:30 周末阅读');
    expect(md).toContain('## 11-29 周日');
  });
});
