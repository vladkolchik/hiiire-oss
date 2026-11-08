import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCandidateBatchToast,
  getCandidateBatchToastId,
  showCandidateBatchAcceptedToast,
  showCandidateBatchFailureToast,
  showCandidateBatchSuccessToast,
} from '../lib/candidate-batch-toast.mjs';

function createToastSpy() {
  const calls = [];

  return {
    calls,
    toast: {
      loading(message, options) {
        calls.push({ method: 'loading', message, options });
      },
      success(message, options) {
        calls.push({ method: 'success', message, options });
      },
      error(message, options) {
        calls.push({ method: 'error', message, options });
      },
      dismiss(id) {
        calls.push({ method: 'dismiss', id });
      },
    },
  };
}

test('showCandidateBatchAcceptedToast uses a session-scoped loading toast id', () => {
  const { calls, toast } = createToastSpy();

  showCandidateBatchAcceptedToast(toast, { sessionId: 7, total: 10, skipAnalysis: false });

  assert.deepEqual(calls, [
    {
      method: 'loading',
      message: 'Принято: 10. Анализ идёт в фоне…',
      options: { id: 'candidate-batch-7' },
    },
  ]);
});

test('showCandidateBatchSuccessToast dismisses the loading toast before showing the final status', () => {
  const { calls, toast } = createToastSpy();

  showCandidateBatchSuccessToast(toast, { sessionId: 7, createdCandidateCount: 10, skipAnalysis: false });

  assert.deepEqual(calls, [
    { method: 'dismiss', id: 'candidate-batch-7' },
    {
      method: 'success',
      message: 'Добавлено 10 кандидатов',
      options: {
        description: 'AI анализ завершён. Результаты обновлены в списке кандидатов.',
      },
    },
  ]);
});

test('showCandidateBatchSuccessToast explains candidates added without AI analysis and keeps tariff action', () => {
  const { calls, toast } = createToastSpy();
  const action = { label: 'Открыть тариф', onClick() {} };

  showCandidateBatchSuccessToast(toast, { sessionId: 8, createdCandidateCount: 2, skipAnalysis: true, action });

  assert.deepEqual(calls, [
    { method: 'dismiss', id: 'candidate-batch-8' },
    {
      method: 'success',
      message: 'Кандидаты добавлены без AI-анализа',
      options: {
        description:
          'AI-анализ сейчас недоступен: подписка неактивна или не хватает кредитов. После оплаты или пополнения баланса запустите анализ из списка кандидатов.',
        action,
      },
    },
  ]);
});

test('showCandidateBatchSuccessToast explains mixed analyzed and no-analysis batches', () => {
  const { calls, toast } = createToastSpy();
  const action = { label: 'Открыть тариф', onClick() {} };

  showCandidateBatchSuccessToast(toast, {
    sessionId: 9,
    createdCandidateCount: 3,
    skipAnalysis: true,
    noAnalysisCount: 1,
    action,
  });

  assert.deepEqual(calls, [
    { method: 'dismiss', id: 'candidate-batch-9' },
    {
      method: 'success',
      message: 'Кандидаты добавлены. Часть без AI-анализа',
      options: {
        description:
          'AI-анализ сейчас недоступен: подписка неактивна или не хватает кредитов. После оплаты или пополнения баланса запустите анализ из списка кандидатов.',
        action,
      },
    },
  ]);
});

test('showCandidateBatchFailureToast dismisses the loading toast before showing the error', () => {
  const { calls, toast } = createToastSpy();

  showCandidateBatchFailureToast(toast, {
    sessionId: 3,
    title: 'Не все кандидаты добавлены',
    description: 'Проверьте файлы и попробуйте ещё раз.',
  });

  assert.deepEqual(calls, [
    { method: 'dismiss', id: 'candidate-batch-3' },
    {
      method: 'error',
      message: 'Не все кандидаты добавлены',
      options: {
        description: 'Проверьте файлы и попробуйте ещё раз.',
      },
    },
  ]);
});

test('clearCandidateBatchToast dismisses the current session toast', () => {
  const { calls, toast } = createToastSpy();

  clearCandidateBatchToast(toast, 11);

  assert.deepEqual(calls, [{ method: 'dismiss', id: getCandidateBatchToastId(11) }]);
});
