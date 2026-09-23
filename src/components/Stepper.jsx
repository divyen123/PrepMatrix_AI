import { Children, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import './Stepper.css';

const clampStep = (step, total) => Math.min(Math.max(Number(step) || 1, 1), Math.max(total, 1));

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  disableStepIndicators = false,
  renderStepIndicator,
  className = '',
  ...rest
}) {
  const steps = Children.toArray(children);
  const totalSteps = steps.length;
  const [currentStep, setCurrentStep] = useState(() => clampStep(initialStep, totalSteps));
  const [direction, setDirection] = useState(0);
  const reducedMotion = useReducedMotion();
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const changeStep = nextStep => {
    if (nextStep === currentStep || nextStep < 1 || nextStep > totalSteps + 1) return;
    setDirection(nextStep > currentStep ? 1 : -1);
    setCurrentStep(nextStep);
    if (nextStep > totalSteps) onFinalStepCompleted();
    else onStepChange(nextStep);
  };

  const clickIndicator = step => {
    if (!disableStepIndicators && !isCompleted) changeStep(step);
  };

  const {
    className: backClassName = '',
    onClick: onBackClick,
    ...backProps
  } = backButtonProps;
  const {
    className: nextClassName = '',
    onClick: onNextClick,
    ...nextProps
  } = nextButtonProps;

  if (totalSteps === 0) return null;

  return (
    <div className={`rb-stepper ${className}`.trim()} {...rest}>
      <div className={`rb-stepper-card ${stepCircleContainerClassName}`.trim()}>
        <div className={`rb-stepper-indicators ${stepContainerClassName}`.trim()} aria-label="Guide progress">
          {steps.map((_, index) => {
            const step = index + 1;
            return (
              <div className="rb-stepper-indicator-group" key={step}>
                {renderStepIndicator ? renderStepIndicator({
                  step,
                  currentStep,
                  onStepClick: clickIndicator,
                }) : (
                  <StepIndicator
                    step={step}
                    totalSteps={totalSteps}
                    currentStep={currentStep}
                    disabled={disableStepIndicators || isCompleted}
                    onClick={() => clickIndicator(step)}
                    reducedMotion={reducedMotion}
                  />
                )}
                {step < totalSteps && (
                  <div className="rb-stepper-connector" aria-hidden="true">
                    <Motion.span
                      className="rb-stepper-connector-fill"
                      initial={false}
                      animate={{ scaleX: currentStep > step ? 1 : 0 }}
                      transition={{ duration: reducedMotion ? 0 : 0.32 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <StepContent
          currentStep={currentStep}
          direction={direction}
          isCompleted={isCompleted}
          reducedMotion={reducedMotion}
          className={contentClassName}
        >
          {steps[currentStep - 1]}
        </StepContent>

        {!isCompleted && (
          <div className={`rb-stepper-footer ${footerClassName}`.trim()}>
            {currentStep > 1 && (
              <button
                {...backProps}
                type="button"
                className={`rb-stepper-back ${backClassName}`.trim()}
                onClick={event => {
                  onBackClick?.(event);
                  if (!event.defaultPrevented) changeStep(currentStep - 1);
                }}
              >
                {backButtonText}
              </button>
            )}
            <button
              {...nextProps}
              type="button"
              className={`rb-stepper-next ${nextClassName}`.trim()}
              onClick={event => {
                onNextClick?.(event);
                if (!event.defaultPrevented) changeStep(currentStep + 1);
              }}
            >
              {isLastStep ? 'Complete' : nextButtonText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepContent({ children, className, currentStep, direction, isCompleted, reducedMotion }) {
  const [height, setHeight] = useState(null);
  const observerRef = useRef(null);
  const contentRef = useCallback(node => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(measure);
      observerRef.current.observe(node);
    }
  }, []);

  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);

  return (
    <Motion.div
      className={`rb-stepper-content ${className}`.trim()}
      aria-live="polite"
      initial={false}
      animate={{ height: isCompleted ? 0 : height ?? 'auto' }}
      transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeInOut' }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <Motion.div
            key={currentStep}
            ref={contentRef}
            className="rb-stepper-slide"
            custom={direction}
            initial={reducedMotion ? false : 'enter'}
            animate="center"
            exit={reducedMotion ? undefined : 'exit'}
            variants={{
              enter: dir => ({ x: dir >= 0 ? '18%' : '-18%', opacity: 0 }),
              center: { x: '0%', opacity: 1 },
              exit: dir => ({ x: dir >= 0 ? '-18%' : '18%', opacity: 0 }),
            }}
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: 'easeInOut' }}
          >
            {children}
          </Motion.div>
        )}
      </AnimatePresence>
    </Motion.div>
  );
}

function StepIndicator({ step, totalSteps, currentStep, disabled, onClick, reducedMotion }) {
  const status = currentStep === step ? 'active' : currentStep > step ? 'complete' : 'inactive';
  return (
    <Motion.button
      type="button"
      className={`rb-stepper-indicator rb-stepper-indicator--${status}`}
      aria-current={status === 'active' ? 'step' : undefined}
      aria-label={`Step ${step} of ${totalSteps}`}
      disabled={disabled || step === currentStep}
      onClick={onClick}
      initial={false}
      animate={{ scale: status === 'active' ? 1.06 : 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.25 }}
    >
      <span className="rb-stepper-indicator-content" aria-hidden="true">
        {status === 'complete' ? (
          <svg className="rb-stepper-check" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <Motion.path
              d="M5 12.5 10 17l9-10"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.28 }}
            />
          </svg>
        ) : status === 'active' ? (
          <span className="rb-stepper-active-dot" />
        ) : (
          step
        )}
      </span>
    </Motion.button>
  );
}

export function Step({ children }) {
  return <div className="rb-stepper-step">{children}</div>;
}
