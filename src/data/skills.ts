import type { Skill } from '../domain/types.js';

const v = '1.0.0';
function s(skill: Omit<Skill, 'version' | 'maxScore'> & { maxScore?: number }): Skill {
  return { version: v, maxScore: 5, ...skill };
}

export const SKILLS: Skill[] = [
  s({ id: 'requirement_understanding', name: 'Requirement Understanding',
    description: 'Captures functional scope, clarifies ambiguity, states assumptions explicitly.',
    criteria: [{ id: 'ru-scope', description: 'Core entities and flows identified' }, { id: 'ru-ambiguity', description: 'Ambiguities listed with explicit assumptions' }],
    scenarios: [
      { id: 'ru-s1', question: 'What is in scope vs out of scope for the MVP?' },
      { id: 'ru-s2', question: 'Which ambiguities did the candidate resolve with explicit assumptions?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Lists check-in/check-out flows, names open questions, states assumptions.', explanation: 'Explicit scope.' },
      { label: 'bad', pattern: 'Jumps to classes with no stated requirements.', explanation: 'No grounding in problem.' }],
  }),
  s({ id: 'responsibility_design', name: 'Responsibility Design',
    description: 'Assigns each behavior to exactly one owner; no god objects; SOLID reasoning.',
    criteria: [{ id: 'rd-srp', description: 'Single responsibility per class' }, { id: 'rd-owner', description: 'Every behavior has a clear owner' }],
    scenarios: [
      { id: 'rd-s1', question: 'Which class owns pricing / fee computation and why?' },
      { id: 'rd-s2', question: 'Is there a god object doing work that belongs elsewhere?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'PricingStrategy owns fee calc; ParkingLot orchestrates.', explanation: 'Separated concerns.' },
      { label: 'bad', pattern: 'ParkingLot class does pricing, persistence, notifications, UI.', explanation: 'God object.' }],
  }),
  s({ id: 'coupling_cohesion', name: 'Coupling & Cohesion',
    description: 'High cohesion within modules, loose coupling between them, dependencies point inward.',
    criteria: [{ id: 'cc-deps', description: 'Dependencies are minimal and abstracted' }, { id: 'cc-cohesion', description: 'Related behavior grouped together' }],
    scenarios: [
      { id: 'cc-s1', question: 'What breaks if the payment provider is swapped?' },
      { id: 'cc-s2', question: 'Do dependencies point at abstractions or concrete classes?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Depends on PaymentGateway interface, not Stripe class.', explanation: 'DIP.' },
      { label: 'bad', pattern: 'ElevatorController directly instantiates hardware drivers everywhere.', explanation: 'Tight coupling.' }],
  }),
  s({ id: 'abstraction_encapsulation', name: 'Abstraction & Encapsulation',
    description: 'Uses interfaces/abstracts for seams; hides internals; no leaking state.',
    criteria: [{ id: 'ae-seams', description: 'Key seams abstracted behind interfaces' }, { id: 'ae-hide', description: 'Internal state not exposed' }],
    scenarios: [
      { id: 'ae-s1', question: 'Which details are hidden behind an interface and why?' },
      { id: 'ae-s2', question: 'Does any caller manipulate another class’s internal state directly?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Vehicle hierarchy or SpotAssignmentPolicy interface.', explanation: 'Abstraction at variation point.' },
      { label: 'bad', pattern: 'Public mutable fields set from five other classes.', explanation: 'Broken encapsulation.' }],
  }),
  s({ id: 'extensibility', name: 'Extensibility',
    description: 'New types/flows added via extension (OCP), not by editing core classes.',
    criteria: [{ id: 'ex-ocp', description: 'New variants need no core edits' }, { id: 'ex-strategy', description: 'Variation handled via polymorphism/config' }],
    scenarios: [
      { id: 'ex-s1', question: 'What changes when a new product/vehicle/payment type is introduced?' },
      { id: 'ex-s2', question: 'What changes when a new business rule or workflow step is added?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'New VehicleType implements FeeStrategy; zero core edits.', explanation: 'Open/closed.' },
      { label: 'bad', pattern: 'switch (type) with new case in 4 files per variant.', explanation: 'Shotgun surgery.' }],
  }),
  s({ id: 'scalability', name: 'Scalability',
    description: 'Reasons about growth in data/throughput; identifies bottlenecks and mitigations.',
    criteria: [{ id: 'sc-bottleneck', description: 'Bottlenecks named (contention, single lock, scan)' }, { id: 'sc-mitigate', description: 'Plausible mitigation (sharding, queue, cache)' }],
    scenarios: [
      { id: 'sc-s1', question: 'What happens if usage/data grows 100x?' },
      { id: 'sc-s2', question: 'Where is the first bottleneck under high-frequency operations, and what mitigates it?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Per-floor dispatch queues; notes single-scheduler contention and sharding.', explanation: 'Bottleneck + fix.' },
      { label: 'bad', pattern: '“It scales because classes are clean.”', explanation: 'No analysis.' }],
  }),
  s({ id: 'failure_handling', name: 'Failure Handling',
    description: 'Partial failures leave consistent state; retries/idempotency considered.',
    criteria: [{ id: 'fh-atomic', description: 'Halfway failures handled (rollback/compensation)' }, { id: 'fh-retry', description: 'Idempotent retry story' }],
    scenarios: [
      { id: 'fh-s1', question: 'What happens if a dependency fails halfway through an operation?' },
      { id: 'fh-s2', question: 'Can a failed operation be retried safely without corrupting state?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Reserve-then-confirm with expiry; payment timeout releases spot.', explanation: 'Compensation.' },
      { label: 'bad', pattern: 'No mention of payment/machine failure.', explanation: 'Happy-path only.' }],
  }),
  s({ id: 'edge_cases_testability', name: 'Edge Cases & Testability',
    description: 'Enumerates edge cases; design is testable (injectable seams, deterministic logic).',
    criteria: [{ id: 'et-edges', description: 'Boundary cases listed' }, { id: 'et-test', description: 'Logic testable without hardware/time' }],
    scenarios: [
      { id: 'et-s1', question: 'How is the core decision logic unit-tested without real hardware?' },
      { id: 'et-s2', question: 'What happens at the boundaries: full, empty, concurrent, or invalid inputs?' },
    ],
    groundingExamples: [
      { label: 'good', pattern: 'Full elevator, power loss mid-dispense, injectable clock/hardware.', explanation: 'Testable.' },
      { label: 'bad', pattern: '“Edge cases: none.” Static calls to hardware.', explanation: 'Untestable.' }],
  }),
];
