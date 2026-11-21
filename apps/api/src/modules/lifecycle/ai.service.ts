import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { logger } from '../../infra/logger';

export interface AiTurn { role: 'user' | 'assistant'; content: string }
export interface AiAnswer { text: string; provider: 'claude' | 'mock'; refused?: boolean }

/**
 * AI assist. Every output is advisory: a person decides (helpdesk agent, expert committee, DV officer).
 * With AI_PROVIDER=claude, calls the Messages API through the official SDK; otherwise returns a
 * deterministic, rule-based answer so the platform works offline and in tests.
 */
@Injectable()
export class AiService {
  private readonly client: Anthropic | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = env.AI_PROVIDER === 'claude' ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }) : null;
  }

  get provider(): 'claude' | 'mock' {
    return this.client ? 'claude' : 'mock';
  }

  /**
   * One request. The system prompt is stable (and cached); volatile context goes into the user turn.
   * Returns null when the provider is mock so callers use their rule-based fallback.
   */
  async complete(system: string, turns: AiTurn[], opts: { maxTokens?: number; effort?: 'low' | 'medium' | 'high' } = {}): Promise<AiAnswer | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.beta.messages.create({
        model: this.env.AI_MODEL,
        max_tokens: opts.maxTokens ?? 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: opts.effort ?? 'low' },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
      });
      if (res.stop_reason === 'refusal') return { text: '', provider: 'claude', refused: true };
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      return { text, provider: 'claude' };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) logger.warn('AI rate limited; using fallback');
      else if (e instanceof Anthropic.APIError) logger.warn({ status: e.status, msg: e.message }, 'AI request failed; using fallback');
      else logger.warn({ err: String(e) }, 'AI request failed; using fallback');
      return null;
    }
  }
}
