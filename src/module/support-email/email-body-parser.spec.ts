import type { gmail_v1 } from 'googleapis';
import {
  findHeader,
  getEmailText,
  htmlToText,
  normalizeSenderAddress,
  parseSupportEmailBody,
} from './email-body-parser';

function textPart(text: string): gmail_v1.Schema$MessagePart {
  return {
    mimeType: 'text/plain',
    body: { data: Buffer.from(text, 'utf8').toString('base64url') },
  };
}

function htmlPart(html: string): gmail_v1.Schema$MessagePart {
  return {
    mimeType: 'text/html',
    body: { data: Buffer.from(html, 'utf8').toString('base64url') },
  };
}

describe('htmlToText', () => {
  it('turns block tags into line breaks and strips remaining markup', () => {
    const html = '<div>Case Id: 92752810</div><p>PropertyID: 2462187</p>';
    // Each of the four tags becomes its own line break, so the two lines
    // end up separated by a blank line rather than a single `\n`.
    expect(htmlToText(html)).toBe(
      'Case Id: 92752810\n\nPropertyID: 2462187',
    );
  });

  it('decodes named and numeric HTML entities', () => {
    expect(htmlToText('A&nbsp;&amp;&nbsp;B &#39;quoted&#39;')).toBe(
      "A & B 'quoted'",
    );
  });

  it('drops script and style blocks and HTML comments', () => {
    const html =
      '<style>.a{color:red}</style><script>alert(1)</script><!-- note -->Hello';
    expect(htmlToText(html)).toBe('Hello');
  });
});

describe('getEmailText', () => {
  it('prefers the text/plain part when present', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [textPart('Plain body'), htmlPart('<p>HTML body</p>')],
    };
    expect(getEmailText(payload)).toBe('Plain body');
  });

  it('falls back to de-tagged HTML when there is no text/plain part', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [htmlPart('<div>Case Id: 1</div>')],
    };
    expect(getEmailText(payload)).toBe('Case Id: 1');
  });

  it('ignores parts that are attachments even if they claim a text mime type', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [
        textPart('Real body'),
        {
          mimeType: 'text/plain',
          filename: 'notes.txt',
          body: { data: Buffer.from('not the body').toString('base64url') },
        },
      ],
    };
    expect(getEmailText(payload)).toBe('Real body');
  });
});

describe('normalizeSenderAddress', () => {
  it('extracts and lowercases the address out of a display-name header', () => {
    expect(normalizeSenderAddress('Agoda <PartnerSupport@agoda.com>')).toBe(
      'partnersupport@agoda.com',
    );
  });

  it('lowercases a bare address with no display name', () => {
    expect(normalizeSenderAddress('PartnerSupport@agoda.com')).toBe(
      'partnersupport@agoda.com',
    );
  });
});

describe('findHeader', () => {
  it('matches header names case-insensitively', () => {
    const headers: gmail_v1.Schema$MessagePartHeader[] = [
      { name: 'From', value: 'Agoda <PartnerSupport@agoda.com>' },
      { name: 'Subject', value: 'RE: Case 92752810' },
    ];
    expect(findHeader(headers, 'subject')).toBe('RE: Case 92752810');
    expect(findHeader(headers, 'FROM')).toBe(
      'Agoda <PartnerSupport@agoda.com>',
    );
  });

  it('returns null when the header is absent', () => {
    expect(findHeader([], 'Subject')).toBeNull();
    expect(findHeader(undefined, 'Subject')).toBeNull();
  });
});

describe('parseSupportEmailBody', () => {
  const body = [
    'Case Id: 92752810',
    'PropertyID: 2462187',
    'Property Name: The Westin Westminster',
    'City: Westminster (CO)',
    'Country: United States',
    '',
    '608820319',
    '590948995',
    '919720506',
    '',
    'This email belongs to the following accommodation partner Email: accounting@example.com',
  ].join('\n');

  it('extracts every labelled field', () => {
    const parsed = parseSupportEmailBody({
      mimeType: 'text/plain',
      body: { data: Buffer.from(body, 'utf8').toString('base64url') },
    });

    expect(parsed.caseId).toBe('92752810');
    expect(parsed.propertyId).toBe('2462187');
    expect(parsed.propertyName).toBe('The Westin Westminster');
    expect(parsed.city).toBe('Westminster (CO)');
    expect(parsed.country).toBe('United States');
    expect(parsed.partnerEmail).toBe('accounting@example.com');
  });

  it('extracts reservation IDs while excluding the case and property IDs', () => {
    const parsed = parseSupportEmailBody({
      mimeType: 'text/plain',
      body: { data: Buffer.from(body, 'utf8').toString('base64url') },
    });

    expect(parsed.reservationIds.sort()).toEqual(
      ['608820319', '590948995', '919720506'].sort(),
    );
    expect(parsed.reservationIds).not.toContain('92752810');
    expect(parsed.reservationIds).not.toContain('2462187');
  });

  it('returns nulls for missing fields instead of throwing', () => {
    const parsed = parseSupportEmailBody({
      mimeType: 'text/plain',
      body: { data: Buffer.from('Nothing useful here', 'utf8').toString('base64url') },
    });

    expect(parsed.caseId).toBeNull();
    expect(parsed.propertyId).toBeNull();
    expect(parsed.propertyName).toBeNull();
    expect(parsed.reservationIds).toEqual([]);
    expect(parsed.partnerEmail).toBeNull();
  });

  it('handles an undefined payload', () => {
    const parsed = parseSupportEmailBody(undefined);
    expect(parsed.caseId).toBeNull();
    expect(parsed.text).toBe('');
  });
});
