import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RatingCode, Settings } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import type { PackWord } from '../content/packVerifier';
import type { Scheduler } from '../domain/scheduler';
import type { CoverageStats } from '../app/queries';
import { useStudySession } from '../app/StudySessionProvider';
import { setNote, setStarred } from '../app/userWordsUseCase';
import { addCustomWord } from '../app/customWordsUseCase';
import { recordSpellingAttempt } from '../app/spellingUseCase';
import { useCardsForExam, useUserWordMeta } from '../app/queries';
import { CardFront } from './CardFront';
import { CardBack } from './CardBack';
import { WordPreviewModal } from './WordPreviewModal';
import { LookupModal } from './LookupModal';
import { SpellingModal } from './SpellingModal';
import { StudySidebar } from './StudySidebar';
import { MobileActionBar } from './MobileActionBar';
import { RoundSummaryView } from './RoundSummaryView';
import { useStudyHotkeys } from './useStudyHotkeys';
import { speak } from './speech';
import { scrollToStudyTop } from './scroll';

/** 学习页（UIUX P1）：卡片 + 右侧栏面板；桌面快捷键与移动端底栏共用同一组 handler。 */

export interface StudyViewProps {
  db: ExamFlowDB;
  dictionary: PackDictionary;
  settings: Settings;
  scheduler: Scheduler;
  now: number;
  coverage: CoverageStats | undefined;
  persisted: boolean | undefined;
  extraNewToday: number;
  onExtraNew: (n: number) => void;
  onOpenSettings: () => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  /** 跳到词根库（未接入时卡片不显示入口） */
  onOpenRoots?: () => void;
}

const RATING_BY_KEY: Record<'1' | '2' | '3', RatingCode> = { '1': 'AGAIN', '2': 'HARD', '3': 'GOOD' };

export function StudyView({
  db,
  dictionary,
  settings,
  scheduler,
  now,
  coverage,
  persisted,
  extraNewToday,
  onExtraNew,
  onOpenSettings,
  onExport,
  onImport,
  onOpenRoots,
}: StudyViewProps) {
  const session = useStudySession();
  const metas = useUserWordMeta(db);
  const allCards = useCardsForExam(db, settings.exam);
  const { state } = session;

  // 同根词只挑「已经学过」的：reps > 0 即视为学过（FSRS 状态的最简口径）
  const knownLemmas = useMemo(() => {
    const known = new Set<string>();
    for (const c of allCards ?? []) {
      if (c.fsrs.reps === 0) continue;
      const word = dictionary.getWord(c.wordId);
      if (word) known.add(word.lemma.toLowerCase());
    }
    return known;
  }, [allCards, dictionary]);

  const currentId = state.currentId;
  const view = currentId ? state.views.get(currentId) : undefined;
  const card = currentId ? state.cards.get(currentId) : undefined;

  const starred = view ? (metas?.find((m) => m.wordId === view.word.id)?.starred ?? false) : false;
  const note = view ? (metas?.find((m) => m.wordId === view.word.id)?.note ?? '') : '';

  const retrievability = useMemo(() => (card ? scheduler.retrievability(card.fsrs, now) : 0), [card, scheduler, now]);

  // 新卡自动发音（设置项）
  useEffect(() => {
    if (!settings.autoPlayAudio || !view || !card) return;
    if (card.fsrs.reps > 0) return;
    speak(view.word.lemma, settings.accent);
  }, [currentId, settings.autoPlayAudio, settings.accent, view, card]);

  // 背面次要区块折叠态（快捷键 R/F 驱动）；换卡即重置，不残留上一张的展开态
  const [etymologyOpen, setEtymologyOpen] = useState(false);
  // 易混词是防错主内容，默认展开；按 F 可收起
  const [confusablesOpen, setConfusablesOpen] = useState(true);
  const [spellOpen, setSpellOpen] = useState(false);
  const [preview, setPreview] = useState<{ lemma: string; word: PackWord | null } | null>(null);
  const [lookup, setLookup] = useState<{ surface: string; word: PackWord | null; sentence?: string } | null>(null);
  useEffect(() => {
    setEtymologyOpen(false);
    setConfusablesOpen(true);
    setSpellOpen(false);
    setPreview(null);
    setLookup(null);
  }, [currentId]);

  /** 「下一个」统一入口：提交评分 → 复位视口（背面读到底部后新卡会从页面中部出现） */
  const advance = useCallback(async () => {
    await session.commitAndNext();
    scrollToStudyTop();
  }, [session]);

  const hotkeys = useMemo(() => {
    function revealOrNext() {
      if (state.phase !== 'active') return;
      if (state.revealed) {
        if (state.pending) void advance();
      } else {
        session.reveal();
      }
    }
    return {
      onRevealOrNext: revealOrNext,
      // → / Enter 与 Space 同行为：同一实现
      onNext: revealOrNext,
      onRate: (key: '1' | '2' | '3') => {
        if (state.phase !== 'active') return;
        const rating = RATING_BY_KEY[key];
        if (state.revealed) session.revise(rating);
        else session.prejudge(rating);
      },
      onPlay: (shift: boolean) => {
        if (!view) return;
        const accent = shift ? (settings.accent === 'uk' ? 'us' : 'uk') : settings.accent;
        speak(view.word.lemma, accent);
      },
      onSuspend: () => {
        if (view && state.phase === 'active') void session.suspendWord(view.word.id);
      },
      onUndo: () => void session.undo(),
      onSpell: () => {
        if (state.phase === 'active' && view) setSpellOpen(true);
      },
      // R / F 只在背面有意义：正面按下无副作用
      onToggleEtymology: () => {
        if (state.revealed) setEtymologyOpen((v) => !v);
      },
      onToggleConfusables: () => {
        if (state.revealed) setConfusablesOpen((v) => !v);
      },
    };
  }, [state, session, view, settings.accent]);

  // 弹窗打开时让位：Esc 与焦点由弹窗自理
  const modalOpen = preview !== null || lookup !== null || spellOpen;
  useStudyHotkeys(hotkeys, state.phase === 'active' && !modalOpen);

  const remainingToday = useMemo(() => {
    const reviewLeft = Math.max(0, (state.plan?.reviewCount ?? 0) - (coverage?.reviewedToday ?? 0));
    const newLeft = Math.max(0, (state.plan?.newCount ?? 0) - (coverage?.newLearnedToday ?? 0));
    return reviewLeft + newLeft;
  }, [state.plan, coverage]);

  const sidebar = (
    <StudySidebar
      plan={state.plan}
      settings={settings}
      coverage={coverage}
      persisted={persisted}
      extraNewToday={extraNewToday}
      onExtraNew={onExtraNew}
      onOpenSettings={onOpenSettings}
      onExport={onExport}
      onImport={onImport}
      ai={
        view && card
          ? {
              word: view.word,
              sense: view.sense,
              sentence: view.sentences[0]?.en,
              cardId: card.id,
              onAppendNote: (text: string) => void setNote(db, view.word.id, [note, `[AI] ${text}`].filter(Boolean).join('\n\n')),
            }
          : null
      }
    />
  );

  if (state.phase === 'idle' || state.building) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[8fr_4fr]">
        <div className="flex flex-col gap-3" aria-busy>
          <div className="h-6 w-40 animate-pulse rounded bg-warm" />
          <div className="h-12 w-64 animate-pulse rounded bg-warm" />
          <div className="h-24 w-full animate-pulse rounded bg-warm" />
          <div className="h-12 w-full animate-pulse rounded bg-warm" />
        </div>
        {sidebar}
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center" role="alert">
        <p className="text-md text-danger">{state.error}</p>
        <button type="button" onClick={() => void session.start()} className="mt-3 text-sm text-accent underline">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[8fr_4fr]">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-raised">
          {state.phase === 'summary' || !view || !card ? (
            <RoundSummaryView
              summary={state.summary ?? { learned: 0, passed: 0, pending: 0 }}
              remainingToday={remainingToday}
              onStartNext={() => void session.start()}
              onExtraNew={onExtraNew}
              onUndo={() => void session.undo()}
              undoAvailable={state.undoEntry !== null}
            />
          ) : state.revealed ? (
            <CardBack
              view={view}
              card={card}
              pending={state.pending}
              lastRequeue={state.lastRequeue}
              note={note}
              accent={settings.accent}
              etymologyOpen={etymologyOpen}
              onToggleEtymology={() => setEtymologyOpen((v) => !v)}
              confusablesOpen={confusablesOpen}
              onToggleConfusables={() => setConfusablesOpen((v) => !v)}
              onOpenWord={(lemma) => setPreview({ lemma, word: dictionary.lookup(lemma) ?? null })}
              onLookupWord={(surface) => setLookup({ surface, word: dictionary.lookup(surface) ?? null, sentence: view.sentences[0]?.en })}
              knownLemmas={knownLemmas}
              {...(onOpenRoots ? { onOpenRoots } : {})}
              starred={starred}
              onToggleStar={() => void setStarred(db, view.word.id, !starred)}
              onPlay={(accent) => speak(view.word.lemma, accent)}
              onOpenSpell={() => setSpellOpen(true)}
              onRevise={(r) => session.revise(r)}
              onCommitNext={() => void advance()}
              onSaveNote={(n) => void setNote(db, view.word.id, n)}
            />
          ) : (
            <CardFront
              view={view}
              card={card}
              retrievability={retrievability}
              starred={starred}
              prejudged={state.pending && !state.revealed ? state.pending.rating : null}
              undoAvailable={state.undoEntry !== null}
              onToggleStar={() => void setStarred(db, view.word.id, !starred)}
              onSuspend={() => void session.suspendWord(view.word.id)}
              onUndo={() => void session.undo()}
              onPlay={(accent) => speak(view.word.lemma, accent)}
              onReveal={() => session.reveal()}
              onPrejudge={(r) => session.prejudge(r)}
              onLookupWord={(surface) => setLookup({ surface, word: dictionary.lookup(surface) ?? null, sentence: view.sentences[0]?.en })}
            />
          )}
        </div>

        {state.phase === 'active' ? (
          <MobileActionBar
            revealed={state.revealed}
            hasPending={Boolean(state.pending)}
            onCommitNext={() => void advance()}
            prejudged={state.pending && !state.revealed ? state.pending.rating : null}
            onPrejudge={(r) => session.prejudge(r)}
            onReveal={() => session.reveal()}
          />
        ) : null}
        <div className="h-20 lg:hidden" aria-hidden />
      </div>

      {preview ? (
        <WordPreviewModal lemma={preview.lemma} word={preview.word} exam={settings.exam} onClose={() => setPreview(null)} />
      ) : null}

      {lookup ? (
        <LookupModal
          open
          surface={lookup.surface}
          word={lookup.word}
          exam={settings.exam}
          starred={Boolean(lookup.word && metas?.find((m) => m.wordId === lookup.word?.id)?.starred)}
          sourceSentence={lookup.sentence}
          onClose={() => setLookup(null)}
          onPlay={() => speak(lookup.word?.lemma ?? lookup.surface, settings.accent)}
          onAdd={async (cn) => {
            if (lookup.word) {
              await setStarred(db, lookup.word.id, true);
              return;
            }
            await addCustomWord(db, { lemma: lookup.surface, phonetic: '', cn, sourceSentence: lookup.sentence }, settings.exam);
          }}
        />
      ) : null}

      {spellOpen && view && card ? (
        <SpellingModal
          open
          lemma={view.word.lemma}
          phonetic={view.word.phoneticUk || view.word.phoneticUs}
          pos={view.sense.pos}
          cn={view.sense.cn}
          accent={settings.accent}
          onClose={() => setSpellOpen(false)}
          onAttempt={(result) => void recordSpellingAttempt(db, { wordId: view.word.id, typed: result.typed, correct: result.correct, hintsUsed: result.hintsUsed })}
        />
      ) : null}

      {sidebar}
    </div>
  );
}
