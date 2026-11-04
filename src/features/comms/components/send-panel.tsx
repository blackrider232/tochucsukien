'use client';

// Progress and result of a send. Everything shown is derived from the run
// state, so nothing is left over from an earlier run (m4c B49).

import { Alert, Button, ProgressBar, SectionCard } from '@/components/ui';
import type { DispatchReport } from '../domain/dispatcher';
import type { Recipient } from '../domain/compose';

export type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; total: number; done: number; current: Recipient | null; stopping: boolean }
  | { kind: 'finished'; report: DispatchReport<Recipient> };

export interface LogLine {
  id: number;
  at: string;
  tone: 'success' | 'error' | 'info';
  text: string;
}

const STOP_REASON: Record<string, string> = {
  cancelled: 'Đã dừng theo yêu cầu.',
  auth: 'Phiên đăng nhập Google hết hạn hoặc bị thu hồi. Đăng nhập lại rồi bấm "Gửi tiếp phần chưa gửi".',
  quota: 'Hòm thư đã hết hạn mức gửi trong ngày của Gmail. Gửi tiếp vào ngày mai.',
  record: 'Không ghi được nhật ký gửi, nên đã dừng để tránh gửi trùng. Kiểm tra kết nối rồi gửi tiếp.',
};

export function SendPanel(props: {
  run: RunState;
  log: ReadonlyArray<LogLine>;
  recipients: number;
  canStart: boolean;
  blocker: string | null;
  testing: boolean;
  onPreview: () => void;
  onTest: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onResumeSkipped: () => void;
}) {
  const { run } = props;
  const running = run.kind === 'running';
  const report = run.kind === 'finished' ? run.report : null;
  return (
    <SectionCard title="Phát hành thư" subtitle="Gửi lần lượt từng thư, cách nhau 1,2 giây; lỗi tạm thời được gửi lại tự động" icon="mail">
      <div className="space-y-4">
        {props.blocker && !running && <Alert tone="warning">{props.blocker}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="eye" disabled={running} onClick={props.onPreview}>Xem trước thư</Button>
          <Button variant="secondary" icon="mail" loading={props.testing} disabled={running || Boolean(props.blocker)} onClick={props.onTest}>Gửi thử cho tôi</Button>
          {running ? (
            <Button variant="danger" icon="x" loading={run.stopping} onClick={props.onStop}>Dừng gửi</Button>
          ) : (
            <Button type="submit" icon="mail" disabled={!props.canStart}>{`Bắt đầu gửi (${props.recipients})`}</Button>
          )}
        </div>
        {running && (
          <div className="space-y-1" aria-live="polite">
            <ProgressBar value={run.done} max={run.total} label={`Đang gửi (${Math.min(run.done + 1, run.total)}/${run.total})${run.current ? `: ${run.current.name || run.current.email}` : ''}`} />
          </div>
        )}
        {report && (
          <Alert
            tone={report.failed.length || report.unrecorded.length ? 'warning' : report.skipped.length ? 'info' : 'success'}
            title={`Hoàn tất: ${report.sent.length} thành công, ${report.failed.length} lỗi${report.skipped.length ? `, ${report.skipped.length} chưa gửi` : ''}.`}
            action={
              report.failed.length > 0 ? (
                <Button variant="secondary" icon="refresh" onClick={props.onRetryFailed}>Gửi lại thư lỗi</Button>
              ) : report.skipped.length > 0 ? (
                <Button variant="secondary" icon="refresh" onClick={props.onResumeSkipped}>Gửi tiếp phần chưa gửi</Button>
              ) : undefined
            }
          >
            {report.stoppedBy ? STOP_REASON[report.stoppedBy] : 'Kết quả từng thư được ghi ở Nhật ký gửi.'}
            {report.unrecorded.length > 0 && ` Đã gửi nhưng chưa ghi nhật ký: ${report.unrecorded.map((u) => u.recipient.email).join(', ')}.`}
          </Alert>
        )}
        {props.log.length > 0 && (
          <ol className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-xs" aria-label="Nhật ký phiên gửi">
            {props.log.map((l) => (
              <li key={l.id} className={l.tone === 'error' ? 'text-danger-ink' : l.tone === 'success' ? 'text-success-ink' : 'text-ink-2'}>
                {`[${l.at}] ${l.text}`}
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}
