import type { ExecutionWork, WorkStep } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyPreset,
  CHAT_PRESETS,
  DEFAULT_CHAT_PREFERENCES,
  decodeChatPreferences,
  presetOf,
  withSwitch,
} from '@/lib/workspace/chat-preferences';
import { currentActivity, visibleWork } from '@/lib/workspace/work-display';

const step = (overrides: Partial<WorkStep> & Pick<WorkStep, 'id' | 'kind'>): WorkStep => ({
  label: '',
  status: 'completed',
  startedAt: 1_000,
  finishedAt: 1_400,
  ...overrides,
});

const work: ExecutionWork = {
  steps: [
    step({ id: 'g0', kind: 'generation' }),
    step({ id: 'r0', kind: 'reasoning', text: 'Je réfléchis.' }),
    step({ id: 'm0', kind: 'message', text: 'Je regarde.' }),
    step({ id: 't0', kind: 'tool', label: 'write_todos' }),
    step({
      id: 'task-1',
      kind: 'delegation',
      label: 'task',
      specialist: 'topology_agent',
      status: 'running',
      finishedAt: null,
    }),
    step({ id: 'r1', kind: 'reasoning', parentId: 'task-1', text: 'Le graphe.' }),
    step({ id: 'm1', kind: 'message', parentId: 'task-1', text: 'Je commence.' }),
    step({
      id: 'call-1',
      kind: 'tool',
      label: 'execute_raw',
      parentId: 'task-1',
      status: 'running',
      finishedAt: null,
    }),
  ],
  omittedSteps: 3,
};

const ids = (display: Parameters<typeof visibleWork>[1]) =>
  visibleWork(work, display).steps.map((s) => s.id);

describe('chat preferences', () => {
  it('sets every switch of a preset and names a combination by the preset it matches', () => {
    expect(DEFAULT_CHAT_PREFERENCES).toEqual(applyPreset('standard'));
    for (const preset of ['simple', 'standard', 'detailed'] as const)
      expect(presetOf(CHAT_PRESETS[preset])).toBe(preset);
    const hiddenSpecialistReasoning = withSwitch(
      applyPreset('detailed'),
      'specialistReasoning',
      false,
    );
    expect(hiddenSpecialistReasoning).toMatchObject({
      detail: 'custom',
      specialistReasoning: false,
      orchestratorReasoning: true,
    });
    // Switching back to a preset's exact combination selects that preset again.
    expect(withSwitch(hiddenSpecialistReasoning, 'specialistReasoning', true).detail).toBe(
      'detailed',
    );
  });

  it('keeps bounded choices, a stored custom combination, and falls back to the defaults', () => {
    expect(decodeChatPreferences(null)).toEqual(DEFAULT_CHAT_PREFERENCES);
    expect(decodeChatPreferences({ version: 3, detail: 'simple' })).toEqual(
      DEFAULT_CHAT_PREFERENCES,
    );
    expect(decodeChatPreferences({ version: 2, detail: 'bavard' })).toEqual(
      DEFAULT_CHAT_PREFERENCES,
    );
    expect(
      decodeChatPreferences({ ...applyPreset('simple'), specialistTools: 'oui', extra: 1 }),
    ).toEqual(applyPreset('simple'));
    expect(decodeChatPreferences({ ...applyPreset('standard'), detail: 'custom' }).detail).toBe(
      'custom',
    );
    expect(
      decodeChatPreferences({ ...applyPreset('standard'), specialistReasoning: true }),
    ).toMatchObject({ detail: 'custom', specialistReasoning: true });
  });

  it('migrates version 1, whose switches applied to Alfred and specialists alike', () => {
    expect(
      decodeChatPreferences({
        version: 1,
        detail: 'simple',
        showReasoning: false,
        showNarration: true,
        showEmptyGenerations: false,
        foldWhenDone: false,
      }),
    ).toEqual({
      version: 2,
      detail: 'custom',
      openWhileWorking: false,
      openReasoningWhileStreaming: false,
      foldWhenDone: false,
      orchestratorReasoning: false,
      orchestratorMessages: true,
      orchestratorTools: true,
      emptyGenerations: false,
      specialistReasoning: false,
      specialistMessages: true,
      specialistTools: true,
    });
    expect(decodeChatPreferences({ version: 1, detail: 'detailed' })).toEqual(
      applyPreset('detailed'),
    );
  });
});

describe('work display', () => {
  it('filters Alfred and its specialists separately and always keeps the specialists', () => {
    expect(visibleWork(work, CHAT_PRESETS.detailed)).toBe(work);
    expect(ids(CHAT_PRESETS.simple)).toEqual(['task-1']);
    expect(ids(CHAT_PRESETS.standard)).toEqual(['r0', 'm0', 't0', 'task-1', 'm1', 'call-1']);
    expect(ids({ ...CHAT_PRESETS.detailed, specialistReasoning: false })).toEqual([
      'g0',
      'r0',
      'm0',
      't0',
      'task-1',
      'm1',
      'call-1',
    ]);
    expect(ids({ ...CHAT_PRESETS.detailed, orchestratorReasoning: false })).toContain('r1');
    expect(visibleWork(work, CHAT_PRESETS.simple).omittedSteps).toBe(3);
  });

  it('names the latest running step, with its specialist when it has one', () => {
    expect(currentActivity(work)).toBe('topology_agent · execute_raw');
    const thinking: ExecutionWork = {
      steps: [step({ id: 'r9', kind: 'reasoning', status: 'running', finishedAt: null })],
      omittedSteps: 0,
    };
    expect(currentActivity(thinking)).toBe('réflexion');
    expect(currentActivity({ steps: [work.steps[0]!], omittedSteps: 0 })).toBeNull();
  });
});
