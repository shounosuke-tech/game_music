import { describe, expect, it } from 'vitest';
import { pickAudioFormat } from './songs';

describe('pickAudioFormat', () => {
  const all = { opus: 'a.opus', aac: 'a.m4a', wav: 'a.wav' };

  it('再生できる形式のうち、優先順位の高いもの（Opus → AAC → WAV）を選ぶ', () => {
    expect(pickAudioFormat(all, () => true)).toBe('opus');
    expect(pickAudioFormat(all, (mime) => !mime.includes('opus'))).toBe('aac');
    expect(pickAudioFormat(all, (mime) => mime === 'audio/wav')).toBe('wav');
  });

  it('用意されていない形式は選ばない', () => {
    expect(pickAudioFormat({ wav: 'a.wav' }, () => true)).toBe('wav');
  });

  it('再生できる形式がなければ null', () => {
    expect(pickAudioFormat(all, () => false)).toBeNull();
  });
});
