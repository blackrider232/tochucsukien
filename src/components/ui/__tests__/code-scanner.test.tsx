import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeScanner } from '../code-scanner';
import { renderUi } from './helpers';

const secure = (v: boolean) => Object.defineProperty(window, 'isSecureContext', { value: v, configurable: true });

afterEach(() => {
  delete (window as { isSecureContext?: boolean }).isSecureContext;
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

function camera(detect: () => Promise<Array<{ rawValue: string }>>, getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }))) {
  class Detector {
    static getSupportedFormats = async () => ['qr_code'];
    detect = detect;
  }
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = Detector;
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  return getUserMedia;
}

describe('CodeScanner', () => {
  it('says so, without a start button, when the page is not on https', () => {
    secure(false);
    renderUi(<CodeScanner onCode={() => {}} />);
    expect(screen.getByText(/https/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bật camera' })).toBeNull();
  });

  it('says so, without a start button, when the browser cannot decode', () => {
    secure(true);
    renderUi(<CodeScanner onCode={() => {}} />);
    expect(screen.getByText(/chưa hỗ trợ quét mã bằng camera/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bật camera' })).toBeNull();
  });

  it('names the fallback the caller gives', () => {
    secure(true);
    renderUi(<CodeScanner onCode={() => {}} fallback="Nhập mã ở ô bên dưới." />);
    expect(screen.getByText(/Nhập mã ở ô bên dưới\./)).toBeInTheDocument();
  });

  it('explains a refused permission and offers a retry', async () => {
    secure(true);
    camera(async () => [], vi.fn(async () => { throw new DOMException('no', 'NotAllowedError'); }));
    const { user } = renderUi(<CodeScanner onCode={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Bật camera' }));
    expect(await screen.findByText(/đang chặn camera/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật camera' })).toBeInTheDocument();
  });

  it('reports a decoded code once per repeat window, and stops the camera when turned off', async () => {
    secure(true);
    const onCode = vi.fn();
    const stop = vi.fn();
    camera(async () => [{ rawValue: 'SCE-CHK:1' }], vi.fn(async () => ({ getTracks: () => [{ stop }] })));
    const { user } = renderUi(<CodeScanner onCode={onCode} />);
    Object.defineProperty(document.querySelector('video')!, 'readyState', { value: 4 });
    await user.click(screen.getByRole('button', { name: 'Bật camera' }));
    expect(await screen.findByRole('button', { name: 'Tắt camera' })).toBeInTheDocument();
    await waitFor(() => expect(onCode).toHaveBeenCalledWith('SCE-CHK:1'));
    await new Promise((r) => setTimeout(r, 700));
    expect(onCode).toHaveBeenCalledTimes(1);
    await act(async () => { screen.getByRole('button', { name: 'Tắt camera' }).click(); });
    expect(stop).toHaveBeenCalled();
  });
});
