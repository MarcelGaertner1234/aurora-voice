'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store/settings';

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Willkommen',
    description: 'Einleitung zu Aurora Voice',
  },
  {
    id: 'provider',
    title: 'Provider',
    description: 'KI-Provider auswählen',
  },
  {
    id: 'api-key',
    title: 'API Key',
    description: 'API Key eingeben',
  },
  {
    id: 'preferences',
    title: 'Einstellungen',
    description: 'Sprache & Hotkey',
  },
  {
    id: 'ready',
    title: 'Fertig',
    description: 'Bereit zum Start',
  },
];

export function useOnboarding() {
  const { settings, updateSettings } = useAppStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Check on mount if onboarding should be shown
  useEffect(() => {
    // Small delay to ensure store is hydrated
    const timer = setTimeout(() => {
      if (!settings.hasCompletedOnboarding) {
        setIsOpen(true);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [settings.hasCompletedOnboarding]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, ONBOARDING_STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, ONBOARDING_STEPS.length - 1)));
  }, []);

  const complete = useCallback(() => {
    updateSettings({
      hasCompletedOnboarding: true,
      onboardingVersion: '1.0.0',
    });
    setIsOpen(false);
  }, [updateSettings]);

  const skip = useCallback(() => {
    complete();
  }, [complete]);

  const reset = useCallback(() => {
    setCurrentStep(0);
    updateSettings({
      hasCompletedOnboarding: false,
    });
    setIsOpen(true);
  }, [updateSettings]);

  const open = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    currentStep,
    totalSteps: ONBOARDING_STEPS.length,
    currentStepInfo: ONBOARDING_STEPS[currentStep],
    steps: ONBOARDING_STEPS,
    nextStep,
    prevStep,
    goToStep,
    complete,
    skip,
    reset,
    open,
    close,
    shouldShow: !settings.hasCompletedOnboarding,
    progress: ((currentStep + 1) / ONBOARDING_STEPS.length) * 100,
  };
}
