// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StudySessionProvider, useStudySession } from './StudySessionProvider';
import { ExamFlowDB } from '../storage/db';
import { PackDictionary } from '../content/dictionary';
import type { PackWord } from '../content/packVerifier';
import { DEFAULT_SETTINGS, type Settings } from '../domain/types';
import { ensureCardsForExam } from './onboardingUseCase';
import { createManualClock } from '../domain/clock';

let db: ExamFlowDB;

beforeEach(async () => {
  await new ExamFlowDB('provider-test').delete();
  db = new ExamFlowDB('provider-test');
  await db.open();
});

const NOW = new Date(2026, 9, 20, 10, 0).getTime();
const clock = createManualClock(NOW);

function packWord(lemma: string, weight: number): PackWord {
  return {
    id: `w_${lemma}`,
    lemma,
    phoneticUk: `/${lemma}/`,
    phoneticUs: '',
    isBasic: false,
    forms: [],
    senses: [
      {
        id: `s_${lemma}_a`,
        pos: 'n.',
        cn: `${lemma} 释义`,
        examStats: { IELTS: { senseWeight: weight, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
      },
    ],
    sentences: [
      {
        id: `x_${lemma}_1`,
        wordId: `w_${lemma}`,
        senseId: `s_${lemma}_a`,
        en: `An ${lemma} sentence.`,
        zh: `一个 ${lemma} 句子。`,
        surfaceForm: lemma,
        provenance: { type: 'ADAPTED', note: '仿真例句' },
      },
    ],
    confusables: [],
    synonyms: [],
  };
}

const dictionary = new PackDictionary([packWord('alpha', 70), packWord('beta', 60)], {});

// 考期 2 天后：D=2 ≤ 21，B = max(1, floor(2/3)) = 1，spread = 1 → n_new = min(50, 2) = 2
// （考期 60 天外时 spread=53，ceil(2/53)=1，队列只会有 1 张——那是规划公式的既定行为）
const settings: Settings = { ...DEFAULT_SETTINGS, examDate: '2026-10-22' };

function setup() {
  return renderHook(() => useStudySession(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StudySessionProvider db={db} dictionary={dictionary} settings={settings} clock={clock}>
        {children}
      </StudySessionProvider>
    ),
  });
}

describe('StudySessionProvider · 完整学习流', () => {
  it('开始 → 预判 → 揭示 → 提交 → 撤销，数据与队列一致', async () => {
    await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: false });
    const { result } = setup();

    // 开始会话：2 张新卡入队
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('active');
    expect(result.current.state.currentId).toBe('IELTS:s_alpha_a'); // 权重高的先
    expect(result.current.state.plan?.newCount).toBe(2);

    // 正面预判 GOOD → 揭示 → 背面改 HARD
    act(() => result.current.prejudge('GOOD'));
    expect(result.current.state.pending?.rating).toBe('GOOD');
    expect(result.current.state.pending?.prejudged).toBe(true);

    act(() => result.current.reveal());
    expect(result.current.state.revealed).toBe(true);

    act(() => result.current.revise('HARD'));
    expect(result.current.state.pending?.rating).toBe('HARD');
    expect(result.current.state.pending?.corrected).toBe(true);

    // 提交：落库 + 推进到下一张
    await act(async () => {
      await result.current.commitAndNext();
    });
    expect(result.current.state.currentId).toBe('IELTS:s_beta_a');
    expect(result.current.state.undoEntry?.kind).toBe('REVIEW');

    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.rating).toBe('HARD');
    expect(logs[0]?.corrected).toBe(true);
    expect(logs[0]?.prejudged).toBe(true);

    // 撤销：卡片还原、日志删除
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.state.undoEntry).toBeNull();
    expect(await db.reviewLogs.count()).toBe(0);
    const row = await db.cards.get('IELTS:s_alpha_a');
    expect(row?.fsrs.reps).toBe(0);
    expect(row?.lastFirstReviewDay).toBeNull();
  });

  it('揭示时未预判则默认 GOOD 且 prejudged=false', async () => {
    await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: false });
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.reveal());
    expect(result.current.state.pending?.rating).toBe('GOOD');
    expect(result.current.state.pending?.prejudged).toBe(false);
  });

  it('队列走完进入小结，统计出现/通关数', async () => {
    await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: false });
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    // 第一张 GOOD（首次即通关），第二张 AGAIN 后重排，最终仍会走完
    await act(async () => {
      await result.current.commitAndNext();
    });
    // 第一张未揭示也能提交（默认 GOOD）——不对：未揭示时 commit 被拦截
    expect(result.current.state.currentId).toBe('IELTS:s_alpha_a'); // 未动

    await act(async () => {
      result.current.prejudge('GOOD');
      result.current.reveal();
    });
    await act(async () => {
      await result.current.commitAndNext();
    });
    expect(result.current.state.currentId).toBe('IELTS:s_beta_a');

    await act(async () => {
      result.current.prejudge('GOOD');
      result.current.reveal();
    });
    await act(async () => {
      await result.current.commitAndNext();
    });
    expect(result.current.state.phase).toBe('summary');
    expect(result.current.state.summary).toEqual({ learned: 2, passed: 2, pending: 0 });
  });

  it('无卡可学时直接进入空小结', async () => {
    const emptyDict = new PackDictionary([], {});
    const { result } = renderHook(() => useStudySession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StudySessionProvider db={db} dictionary={emptyDict} settings={settings} clock={clock}>
          {children}
        </StudySessionProvider>
      ),
    });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.phase).toBe('summary');
    expect(result.current.state.currentId).toBeNull();
  });

  it('词书未就绪时开始会话给出错误', async () => {
    const { result } = renderHook(() => useStudySession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StudySessionProvider db={db} dictionary={null} settings={settings} clock={clock}>
          {children}
        </StudySessionProvider>
      ),
    });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.error).toContain('词书尚未加载');
  });

  /*
   * 回归 QA-2 P0-1：examDate 为空串时，parseDay('') 会抛「非法日期」。
   * 契约（team-lead 裁定）：未设考期不建会话、不 dispatch、保持 idle——
   * ExamFlowApp 在 examDate 为空时恒渲染引导面板，state.error 无处展示，
   * 派发错误只会留下不可见的死状态；设置保存后由 revision 效果重启 start()。
   */
  it('考期未设置时 start() 保持 idle 不报错，而不是 parseDay 的非法日期', async () => {
    const { result } = renderHook(() => useStudySession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StudySessionProvider
          db={db}
          dictionary={dictionary}
          settings={{ ...settings, examDate: '' }}
          clock={clock}
        >
          {children}
        </StudySessionProvider>
      ),
    });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.building).toBe(false);
  });
});
