import { resolveReplySearchCutoff } from './reply-status.util';

describe('resolveReplySearchCutoff', () => {
  const createdAt = new Date('2026-09-16T17:49:41.302Z');

  it('uses job_completed_date when present', () => {
    expect(
      resolveReplySearchCutoff({
        job_completed_date: '09/16/2026',
        reply_deadline_at: new Date('2026-09-18T18:31:35.756Z'),
        createdAt,
      }),
    ).toEqual(new Date(2026, 8, 16));
  });

  it('derives the completion time from reply_deadline_at when the date is missing', () => {
    expect(
      resolveReplySearchCutoff({
        job_completed_date: null,
        reply_deadline_at: new Date('2026-09-18T18:31:35.756Z'),
        createdAt,
      }),
    ).toEqual(new Date('2026-09-16T18:31:35.756Z'));
  });

  it('falls back to createdAt when neither completion field is set', () => {
    expect(
      resolveReplySearchCutoff({
        job_completed_date: null,
        reply_deadline_at: null,
        createdAt,
      }),
    ).toEqual(createdAt);
  });
});
