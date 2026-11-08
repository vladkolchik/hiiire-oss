import type * as React from "react";

type ToastApi = {
  loading: (message: React.ReactNode, options?: { id?: number | string }) => number | string;
  success: (
    message: React.ReactNode,
    options?: {
      description?: React.ReactNode;
      action?: {
        label: React.ReactNode;
        onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      };
    }
  ) => number | string;
  error: (
    message: React.ReactNode,
    options?: {
      description?: React.ReactNode;
      action?: {
        label: React.ReactNode;
        onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      };
    }
  ) => number | string;
  dismiss: (id?: number | string) => number | string | void;
};

export declare function getCandidateBatchToastId(sessionId: number): string;

export declare function showCandidateBatchAcceptedToast(
  toastApi: ToastApi,
  options: {
    sessionId: number;
    total: number;
    skipAnalysis: boolean;
  }
): void;

export declare function showCandidateBatchSuccessToast(
  toastApi: ToastApi,
  options: {
    sessionId: number;
    createdCandidateCount: number;
    skipAnalysis: boolean;
    noAnalysisCount?: number;
    action?: {
      label: React.ReactNode;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    };
  }
): void;

export declare function showCandidateBatchFailureToast(
  toastApi: ToastApi,
  options: {
    sessionId: number;
    title: React.ReactNode;
    description?: React.ReactNode;
    action?: {
      label: React.ReactNode;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    };
  }
): void;

export declare function clearCandidateBatchToast(toastApi: ToastApi, sessionId: number): void;
