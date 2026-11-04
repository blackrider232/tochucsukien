'use client';

// Progress and result of a send. Everything shown is derived from the run
// state, so nothing is left over from an earlier run (m4c B49).

import { Alert, Button, ProgressBar, SectionCard } from '@/components/ui';
import type { CampaignReport } from '../domain/campaign';
import type { Recipient } from '../domain/compose';

export type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; total: number; done: number; current: Recipient | null; stopping: boolean }
  | { kind: 'finished'; report: CampaignReport };

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
  claim_lost: 'Một phiên gửi khác đã tiếp quản những người nhận còn lại, nên phiên này đã dừng để không gửi trùng. Xem Nhật ký gửi.',
  record: 'Không ghi được nhật ký gửi, nên đã dừng để tránh gửi trùng. Kiểm tra kết nối rồi gửi tiếp.',
};

export function SendPanel(props: {
  run: RunState;
  log: ReadonlyArray<LogLine>;
  recipients: number;
  canStart: boolean;
  /** "Gửi thử cho tôi" writes no data but sends mail, so it needs the send permission like a run. */
  canTest: boolean;
  blocker: string | null;
  testing: boolean;
  onPreview: () => void;
  onTest: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onResumeSkipped: () => void;
  onTakeOver: () => void;
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
          <Button variant="secondary" icon="mail" loading={props.testing} disabled={running || !props.canTest} onClick={props.onTest}>Gửi thử cho tôi</Button>
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
            tone={report.claimFailed || report.failed.length || report.unrecorded.length ? 'warning' : report.skipped.length ? 'info' : 'success'}
            title={
              report.claimFailed
                ? 'Chưa gửi thư nào.'
                : `Hoàn tất: ${report.sent.length} thành công, ${report.failed.length} lỗi${report.skipped.length ? `, ${report.skipped.length} chưa gửi` : ''}${report.alreadySent.length ? `, ${report.alreadySent.length} đã nhận thư này nên không gửi lại` : ''}${report.inFlight.length ? `, ${report.inFlight.length} đang được gửi ở phiên khác` : ''}.`
            }
            action={
              report.failed.length > 0 ? (
                <Button variant="secondary" icon="refresh" onClick={props.onRetryFailed}>Gửi lại thư lỗi</Button>
              ) : report.skipped.length > 0 ? (
                <Button variant="secondary" icon="refresh" onClick={props.onResumeSkipped}>Gửi tiếp phần chưa gửi</Button>
              ) : undefined
            }
          >
            {report.claimFailed ? 'Không giữ chỗ được người nhận cho đợt gửi. Kiểm tra kết nối rồi bấm gửi lại.' : report.stoppedBy ? STOP_REASON[report.stoppedBy] : 'Kết quả từng thư được ghi ở Nhật ký gửi.'}
            {report.unrecorded.length > 0 && ` Đã gửi nhưng chưa ghi nhật ký: ${report.unrecorded.map((u) => u.recipient.email).join(', ')}.`}
          </Alert>
        )}
        {report && report.ownInFlight.length > 0 && (
          <Alert
            tone="warning"
            title={`${report.ownInFlight.length} người nhận đang được giữ chỗ bởi một phiên gửi khác của bạn.`}
            action={<Button variant="secondary" icon="refresh" onClick={props.onTakeOver}>Tiếp quản phiên gửi</Button>}
          >
            {`Một tab khác, hoặc trang này trước khi tải lại, đang gửi thư này tới họ nên chưa gửi lại: ${report.ownInFlight.map((r) => r.email).join(', ')}. Chỉ tiếp quản khi phiên đó đã đóng hoặc đã dừng.`}
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
