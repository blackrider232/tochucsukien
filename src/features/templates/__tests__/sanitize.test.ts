import { describe, expect, it } from 'vitest';
import type { Instant, Version } from '@/core/brand';
import { resolveCatalog, type StoredTemplate } from '../domain/catalog';
import { renderTemplate } from '../domain/merge-tags';
import { mergeCtx } from './fixtures';

const stored = (contentHtml: string): StoredTemplate => ({
  templateKey: '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e', baseBuiltinKey: null, level: 'cap_trungtam', code: '', title: 'x', kind: 'doc', description: '',
  contentHtml, version: 1 as Version, updatedAt: '2026-11-01T00:00:00.000Z' as Instant,
});
const shown = (html: string) => resolveCatalog([stored(html)]).at(-1)!.content;
const rendered = (html: string) => renderTemplate(resolveCatalog([stored(html)]).at(-1)!, mergeCtx());
const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const ATTACKS: ReadonlyArray<readonly [string, string]> = [
  ['script element', '<p>a</p><script>alert(1)</script>'],
  ['event handler attribute', '<p onclick="alert(1)" onmouseover=alert(1)>a</p>'],
  ['onerror on an image', '<img src=x onerror=alert(1)>'],
  ['javascript: link', '<a href="javascript:alert(1)">a</a>'],
  ['mixed-case javascript: link', '<a href="JaVaScRiPt:alert(1)">a</a>'],
  ['entity-encoded javascript: link', '<a href="java&#115;cript:alert(1)">a</a>'],
  ['tab inside javascript:', '<a href="java\tscript:alert(1)">a</a>'],
  ['data: link', '<a href="data:text/html,<script>alert(1)</script>">a</a>'],
  ['svg onload', '<svg onload=alert(1)><circle/></svg>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['object and embed', '<object data="x"></object><embed src="x">'],
  ['form with an action', '<form action="https://evil.example"><input name="p"></form>'],
  ['style with url()', '<p style="background: url(https://evil.example/x.png)">a</p>'],
  ['style with expression()', '<p style="width: expression(alert(1))">a</p>'],
  ['style with @import', '<p style="@import url(x)">a</p>'],
  ['style element', '<style>body { display: none }</style><p>a</p>'],
  ['base and meta', '<base href="https://evil.example"><meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ['mutation xss via noscript', '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>'],
  ['srcdoc', '<p srcdoc="<script>alert(1)</script>">a</p>'],
];

describe('sanitizing template content on every path (m3 B02)', () => {
  it.each(ATTACKS)('%s is removed when a template is listed', (_name, attack) => {
    const out = shown(attack);
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|<form|<style|<base|<meta|<svg|<noscript/i);
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out).not.toMatch(/javascript:|data:text|expression\(|url\(|@import|srcdoc/i);
    expect(doc(out).querySelectorAll('script, iframe, img[onerror]')).toHaveLength(0);
  });

  it.each(ATTACKS)('%s is removed again when a template is rendered with an event', (_name, attack) => {
    const out = rendered(attack);
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|<form|<style|<base|<meta|<svg|<noscript/i);
    expect(out).not.toMatch(/\son[a-z]+\s*=|javascript:|expression\(|url\(/i);
  });

  it('keeps what a NĐ 30 document needs: tables, alignment, inline text style, spans, lists and plain links', () => {
    const keep = '<table border="1" style="width:100%;border-collapse:collapse"><tr><th>STT</th></tr><tr><td style="text-align:center;padding:6px">1</td></tr></table><p style="text-align:justify;font-weight:bold;color:#1e3a8a">a</p><ul><li>b</li></ul><a href="https://example.com/x" target="_blank">c</a>';
    const out = doc(shown(keep));
    expect(out.querySelector('table')?.getAttribute('border')).toBe('1');
    expect(out.querySelector('th')?.textContent).toBe('STT');
    expect(out.querySelector('td')?.getAttribute('style')).toContain('text-align');
    expect(out.querySelector('p')?.getAttribute('style')).toContain('font-weight');
    expect(out.querySelector('li')?.textContent).toBe('b');
    expect(out.querySelector('a')?.getAttribute('href')).toBe('https://example.com/x');
    expect(out.querySelector('a')?.getAttribute('rel')).toContain('noopener');
  });

  it('does not let a merge value reintroduce markup into the sanitized document', () => {
    const out = renderTemplate(resolveCatalog([stored('<p>{{TEN_SU_KIEN}}</p>')]).at(-1)!, mergeCtx({ name: '</p><script>alert(1)</script><p onclick=alert(1)>' }));
    const parsed = doc(out);
    expect(parsed.querySelectorAll('script, [onclick]')).toHaveLength(0);
    expect(parsed.querySelectorAll('p')).toHaveLength(1);
    expect(parsed.querySelector('p')!.textContent).toBe('</p><script>alert(1)</script><p onclick=alert(1)>');
  });
});
