import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { ENV, type Env } from '../../config/env';
import { logger } from '../../infra/logger';

const TPL_DIR = path.resolve(__dirname, '../../../../templates/pdf');
const TPL_DIR_SRC = path.resolve(__dirname, '../../../templates/pdf');

function tplDir(): string {
  try { readFileSync(path.join(TPL_DIR, 'base.css')); return TPL_DIR; } catch { return TPL_DIR_SRC; }
}

function fontFace(family: string, pkg: string, file: string, weight: number): string {
  const p = require.resolve(`${pkg}/files/${file}`);
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(p).toString('base64')}) format('woff2');}`;
}

export type PdfTemplate = 'otr-slip' | 'application-form' | 'receipt' | 'admit-card' | 'roll-sheet' | 'call-letter';

/** Server-side PDFs via headless Chromium (correct Devanagari shaping), fonts and images embedded. */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private browser: Promise<Browser> | null = null;
  private readonly hbs = Handlebars.create();
  private readonly templates = new Map<PdfTemplate, HandlebarsTemplateDelegate>();
  private css = '';
  readonly assets: { logo: string; mark: string };

  constructor(@Inject(ENV) private readonly env: Env) {
    const dir = tplDir();
    this.hbs.registerHelper('inc', (i: number) => i + 1);
    const partials = readFileSync(path.join(dir, 'partials.hbs'), 'utf8');
    this.partialsSrc = partials;
    this.assets = {
      logo: `data:image/png;base64,${readFileSync(path.join(dir, 'vtl-logo.png')).toString('base64')}`,
      mark: `data:image/png;base64,${readFileSync(path.join(dir, 'vtl-mark.png')).toString('base64')}`,
    };
    try {
      this.css = [
        fontFace('Inter', '@fontsource/inter', 'inter-latin-400-normal.woff2', 400),
        fontFace('Inter', '@fontsource/inter', 'inter-latin-600-normal.woff2', 600),
        fontFace('Inter', '@fontsource/inter', 'inter-latin-700-normal.woff2', 700),
        fontFace('Plus Jakarta Sans', '@fontsource/plus-jakarta-sans', 'plus-jakarta-sans-latin-700-normal.woff2', 700),
        fontFace('Noto Sans Devanagari', '@fontsource/noto-sans-devanagari', 'noto-sans-devanagari-devanagari-400-normal.woff2', 400),
        fontFace('Noto Sans Devanagari', '@fontsource/noto-sans-devanagari', 'noto-sans-devanagari-devanagari-600-normal.woff2', 600),
      ].join('\n');
    } catch (e) {
      logger.warn({ err: String(e) }, 'pdf fonts not found; falling back to system fonts');
    }
    this.css += readFileSync(path.join(dir, 'base.css'), 'utf8');
    this.dir = dir;
  }
  private partialsSrc: string;
  private dir: string;

  private template(name: PdfTemplate): HandlebarsTemplateDelegate {
    let t = this.templates.get(name);
    if (!t) {
      t = this.hbs.compile(`${this.partialsSrc}\n${readFileSync(path.join(this.dir, `${name}.hbs`), 'utf8')}`);
      this.templates.set(name, t);
    }
    return t;
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= chromium.launch({ headless: true, executablePath: this.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] }).catch((e) => {
      this.browser = null;
      throw e;
    });
    return this.browser;
  }

  renderHtml(name: PdfTemplate, data: Record<string, unknown>): string {
    const body = this.template(name)({ ...data, assets: this.assets });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${this.css}</style></head><body>${body}</body></html>`;
  }

  async render(name: PdfTemplate, data: Record<string, unknown>): Promise<Buffer> {
    const html = this.renderHtml(name, data);
    const browser = await this.getBrowser();
    const page = await browser.newPage({ javaScriptEnabled: false });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
  }
}
