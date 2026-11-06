'use client';

// "Báo cáo UBND TP và Sở Tài chính" (m6 §1.4): each card opens its own
// template, for this event, in the templates feature (BUG-18/20). No report
// is rendered here with the daily report's countdown.

import { Badge, Button, EmptyState, PrintLink, SectionCard } from '@/components/ui';
import type { Tone } from '@/core/vocab';
import { resolveTemplateKey, templateHref, templatePrintHref } from '@/features/templates';
import type { ReportsScreenData } from '../domain/screen';

const OFFICIAL: ReadonlyArray<{ key: string; when: string; tone: Tone; title: string; text: string }> = [
  {
    key: 'form_kh_ubnd', when: 'Trước sự kiện', tone: 'blue', title: 'Báo cáo kế hoạch chuẩn bị và tiến độ triển khai',
    text: 'Báo cáo Lãnh đạo UBND Thành phố về công tác mời đại biểu, thuê địa điểm, kịch bản chương trình và phương án an ninh.',
  },
  {
    key: 'form_baocao_ubnd_ketqua', when: 'Ngay sau sự kiện', tone: 'emerald', title: 'Báo cáo nhanh kết quả tổ chức sự kiện',
    text: 'Gửi trong ngày: số đại biểu thực tế có mặt, lãnh đạo tham dự, các thỏa thuận ký kết, tình hình an ninh trật tự.',
  },
  {
    key: 'form_baocao_stc_quyettoan', when: 'Sau sự kiện 3 ngày', tone: 'purple', title: 'Báo cáo tổng kết và đánh giá hiệu quả xúc tiến',
    text: 'Đánh giá chỉ số kết quả, hiệu quả kết nối giao thương, phản hồi của doanh nghiệp và hồ sơ nghiệm thu, quyết toán kinh phí.',
  },
];

export function OfficialTab({ data }: { data: ReportsScreenData }) {
  return (
    <SectionCard title="Mẫu báo cáo gửi UBND Thành phố và Sở Tài chính" subtitle="Soạn và in theo thể thức Nghị định số 30/2020/NĐ-CP, điền sẵn thông tin của sự kiện này" icon="landmark">
      <ul className="grid gap-4 md:grid-cols-3">
        {OFFICIAL.map((o) => {
          const id = resolveTemplateKey(o.key);
          return (
            <li key={o.key} className="flex flex-col gap-3 border-b border-line pb-4 md:border-b-0 md:pb-0">
              <Badge tone={o.tone}>{o.when}</Badge>
              <h3 className="text-sm font-bold text-ink">{o.title}</h3>
              <p className="flex-1 text-sm text-ink-2">{o.text}</p>
              {id ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon="pencil" href={templateHref(id, data.event.id)}>Mở soạn thảo</Button>
                  <PrintLink href={templatePrintHref(id, data.event.id)} label="In báo cáo" />
                </div>
              ) : (
                <EmptyState icon="file-text" title="Chưa gắn biểu mẫu" />
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
