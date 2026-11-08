export function getCandidateBatchToastId(sessionId) {
  return `candidate-batch-${sessionId}`;
}

function getAcceptedMessage(total, skipAnalysis) {
  return skipAnalysis
    ? `Принято: ${total}. Добавляем без AI-анализа…`
    : `Принято: ${total}. Анализ идёт в фоне…`;
}

function getSuccessMessage(createdCandidateCount, skipAnalysis, noAnalysisCount) {
  return skipAnalysis && noAnalysisCount > 0 && noAnalysisCount < createdCandidateCount
    ? 'Кандидаты добавлены. Часть без AI-анализа'
    : skipAnalysis
      ? 'Кандидаты добавлены без AI-анализа'
      : `Добавлено ${createdCandidateCount} кандидатов`;
}

function getSuccessDescription(skipAnalysis) {
  return skipAnalysis
    ? "AI-анализ сейчас недоступен: подписка неактивна или не хватает кредитов. После оплаты или пополнения баланса запустите анализ из списка кандидатов."
    : "AI анализ завершён. Результаты обновлены в списке кандидатов.";
}

export function showCandidateBatchAcceptedToast(toastApi, { sessionId, total, skipAnalysis }) {
  toastApi.loading(getAcceptedMessage(total, skipAnalysis), {
    id: getCandidateBatchToastId(sessionId),
  });
}

export function showCandidateBatchSuccessToast(toastApi, { sessionId, createdCandidateCount, skipAnalysis, noAnalysisCount = 0, action }) {
  clearCandidateBatchToast(toastApi, sessionId);
  const options = {
    description: getSuccessDescription(skipAnalysis),
  };

  if (action) {
    options.action = action;
  }

  toastApi.success(getSuccessMessage(createdCandidateCount, skipAnalysis, noAnalysisCount), options);
}

export function showCandidateBatchFailureToast(toastApi, { sessionId, title, description, action }) {
  clearCandidateBatchToast(toastApi, sessionId);
  const options = {};

  if (description) {
    options.description = description;
  }

  if (action) {
    options.action = action;
  }

  toastApi.error(title, options);
}

export function clearCandidateBatchToast(toastApi, sessionId) {
  toastApi.dismiss(getCandidateBatchToastId(sessionId));
}
