import { EXECUTION_OUTPUT_MAX_LENGTH } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import { LiveAnswer } from '@/contexts/chat-session/live-answer';
import { snapshot } from '../../../support/executions-api';

describe('live answer buffers', () => {
  it('accumulates stream deltas for the open message only and rejects a foreign message', () => {
    const answer = new LiveAnswer();
    expect(answer.start('m1')).toBe(false);
    expect(answer.append('m1', 'Bon')).toBe(true);
    expect(answer.append('m2', 'jour')).toBe(false);
    expect(answer.text).toBe('Bon');
    expect(answer.streamed).toBe(true);
  });

  it('shows the longer prefix when a JSON read runs ahead of the stream, then lets the stream catch up', () => {
    const answer = new LiveAnswer();
    answer.start('m1');
    answer.append('m1', 'Par');
    expect(answer.read(snapshot({ assistantText: 'Partiel' }), false)).toBe(true);
    expect(answer.text).toBe('Partiel');
    // Deltas stay relative to what the stream sent; they never duplicate the read text.
    answer.append('m1', 'tiel !');
    expect(answer.text).toBe('Partiel !');
  });

  it('keeps streamed content over an older non-settled read and takes a settled read as authoritative', () => {
    const answer = new LiveAnswer();
    answer.start('m1');
    answer.append('m1', 'Partial');
    expect(answer.read(snapshot({ assistantText: 'Old' }), false)).toBe(false);
    expect(answer.text).toBe('Partial');
    expect(answer.read(snapshot({ assistantText: 'Complet' }), true)).toBe(true);
    expect(answer.text).toBe('Complet');
    expect(answer.messageId).toBeNull();
    expect(answer.streamed).toBe(false);
  });

  it('replaces the visible answer when another message opens and resets on a new attach', () => {
    const answer = new LiveAnswer();
    answer.read(snapshot({ assistantText: 'From read' }), false);
    answer.start('m1');
    answer.append('m1', 'First');
    expect(answer.start('m2')).toBe(true);
    expect(answer.text).toBe('');
    answer.append('m2', 'Second');
    expect(answer.toolStart('t1', 'read_file')).toBe(true);
    expect(answer.toolStart('t1', 'read_file')).toBe(false);
    answer.toolResult('t1', 'failed');
    expect(answer.activities).toEqual([{ id: 't1', label: 'read_file', status: 'failed' }]);
    answer.reset();
    expect(answer.messageId).toBeNull();
    expect(answer.activities).toEqual([]);
    expect(answer.append('m2', 'x')).toBe(false);
  });

  it('lets a re-attached run replace text that an earlier read had shown, whatever its length', () => {
    const answer = new LiveAnswer();
    answer.read(snapshot({ assistantText: 'Progress Chat A 40' }), false);
    expect(answer.text).toBe('Progress Chat A 40');
    answer.reset();
    answer.start('m1');
    answer.append('m1', 'Finished A');
    expect(answer.text).toBe('Finished A');
  });

  it('refuses a delta that would take the answer past the bounded length and keeps the text', () => {
    const answer = new LiveAnswer();
    answer.start('m1');
    expect(answer.append('m1', 'x'.repeat(EXECUTION_OUTPUT_MAX_LENGTH))).toBe(true);
    expect(answer.append('m1', 'y')).toBe(false);
    expect(answer.text).toHaveLength(EXECUTION_OUTPUT_MAX_LENGTH);
    expect(answer.text.endsWith('x')).toBe(true);
  });
});
