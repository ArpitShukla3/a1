import type { Problem } from '../domain/types.js';

export const PROBLEMS: Problem[] = [
  {
    id: 'parking-lot', title: 'Parking Lot',
    requirements: ['Multiple floors with spot types (compact/large/handicapped)', 'Vehicle entry, spot assignment, exit with fee computation', 'Support hourly + daily caps, multiple payment modes'],
    constraints: ['Single machine MVP, in-memory ok', 'Handle concurrent entry/exit'],
    assumptions: ['Fee schedule given', 'No license-plate recognition hardware'],
    skillIds: ['requirement_understanding', 'responsibility_design', 'coupling_cohesion', 'abstraction_encapsulation', 'extensibility', 'scalability', 'failure_handling', 'edge_cases_testability'],
  },
  {
    id: 'elevator', title: 'Elevator System',
    requirements: ['N elevators, M floors', 'Up/down + in-cabin requests', 'Scheduling (SCAN/LOOK) with direction handling'],
    constraints: ['Real-time dispatch, avoid starvation', 'Handle faults (door stuck, power loss)'],
    assumptions: ['One building, identical cars unless stated'],
    skillIds: ['requirement_understanding', 'responsibility_design', 'coupling_cohesion', 'abstraction_encapsulation', 'extensibility', 'scalability', 'failure_handling', 'edge_cases_testability'],
  },
  {
    id: 'vending-machine', title: 'Vending Machine',
    requirements: ['Product selection, payment (cash/card), dispense + change', 'Inventory tracking and sold-out handling'],
    constraints: ['Single machine, offline-first', 'Exact-change edge cases'],
    assumptions: ['Fixed product grid', 'Payment gateway abstracted'],
    skillIds: ['requirement_understanding', 'responsibility_design', 'coupling_cohesion', 'abstraction_encapsulation', 'extensibility', 'scalability', 'failure_handling', 'edge_cases_testability'],
  },
];
