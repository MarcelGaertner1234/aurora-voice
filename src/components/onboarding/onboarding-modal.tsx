'use client';

import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import { useOnboarding, ONBOARDING_STEPS } from '@/hooks/use-onboarding';

// Steps
import { WelcomeStep } from './steps/welcome-step';
import { ProviderStep } from './steps/provider-step';
import { ApiKeyStep } from './steps/api-key-step';
import { PreferencesStep } from './steps/preferences-step';
import { ReadyStep } from './steps/ready-step';

const STEP_COMPONENTS = [
  WelcomeStep,
  ProviderStep,
  ApiKeyStep,
  PreferencesStep,
  ReadyStep,
];

export function OnboardingModal() {
  const {
    isOpen,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    complete,
    skip,
    progress,
  } = useOnboarding();

  const CurrentStepComponent = STEP_COMPONENTS[currentStep];

  return (
    <Dialog.Root open={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] glass"
                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
              >
                {/* Progress Bar */}
                <div className="h-1 bg-foreground/10">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>

                {/* Accessibility: Hidden title and description for screen readers */}
                <VisuallyHidden.Root>
                  <Dialog.Title>Aurora Voice Setup</Dialog.Title>
                  <Dialog.Description>
                    Einrichtungsassistent für Aurora Voice
                  </Dialog.Description>
                </VisuallyHidden.Root>

                {/* Skip Button */}
                {currentStep < totalSteps - 1 && (
                  <button
                    onClick={skip}
                    className="absolute right-4 top-4 z-10 rounded-full p-2 text-foreground-secondary transition-colors hover:bg-background-secondary hover:text-foreground"
                    aria-label="Skip onboarding"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}

                {/* Step Indicators */}
                <div className="flex justify-center gap-2 px-8 pt-6">
                  {ONBOARDING_STEPS.map((step, index) => (
                    <div
                      key={step.id}
                      className={`h-1.5 w-8 rounded-full transition-colors ${
                        index <= currentStep
                          ? 'bg-primary'
                          : 'bg-foreground/10'
                      }`}
                    />
                  ))}
                </div>

                {/* Step Content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="p-8"
                  >
                    <CurrentStepComponent
                      onNext={nextStep}
                      onBack={prevStep}
                      onComplete={complete}
                      onSkip={skip}
                      isFirst={currentStep === 0}
                      isLast={currentStep === totalSteps - 1}
                    />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
